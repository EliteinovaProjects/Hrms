import os
from datetime import date, datetime
from urllib.parse import urlparse

from flask import Flask, request

if os.name == "nt":
    os.add_dll_directory(r"C:\Program Files\PostgreSQL\18\bin")

import cloudinary
from flask_cors import CORS

from config import Config
from extensions import db, migrate, jwt
from api.v1 import blueprints


app = Flask(__name__)
print(app)

app.config.from_object(Config)

# cloudinary.config(cloudinary_url=...) only stores the raw string on this SDK
# version — cloud_name/api_key/api_secret are otherwise left as None. Parse it
# ourselves so uploads (profile pictures, employee documents) actually work.
_cloudinary_url = urlparse(app.config["CLOUDINARY_URL"] or "")
cloudinary.config(
    cloud_name=_cloudinary_url.hostname,
    api_key=_cloudinary_url.username,
    api_secret=_cloudinary_url.password,
)

# Default dev origins, plus anything set via CORS_ORIGINS (comma-separated) in production
DEFAULT_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173", "https://hrms-frontend-rosy-nine.vercel.app"]
CORS(app, resources={r"/api/*": {"origins": DEFAULT_ORIGINS + app.config["CORS_ORIGINS"]}}, supports_credentials=True)

db.init_app(app)
migrate.init_app(app, db)
jwt.init_app(app)

for bp, prefix in blueprints:
    app.register_blueprint(bp, url_prefix=f"/api/v1{prefix}")


# ==================================================================
#  AUTOMATED CRM INCENTIVE PAYOUT
#
# No cron/task-queue infra exists in this deployment, so the "runs
# automatically on the 20th of every month" requirement is driven
# opportunistically off real traffic instead: the first API request
# that lands on/after the 20th triggers it. auto_process_due_payouts()
# is idempotent (IncentivePayoutRun guards it), so this is safe to
# attempt repeatedly — _last_auto_payout_check just avoids paying the
# cost of that idempotency check on every single request within the
# same day.
# ==================================================================

_last_auto_payout_check = None


@app.before_request
def _maybe_run_auto_incentive_payout():
    global _last_auto_payout_check

    if not request.path.startswith("/api/v1/"):
        return

    today = date.today()
    if today.day < 20 or _last_auto_payout_check == today:
        return
    _last_auto_payout_check = today

    from api.v1.crm.incentive_engine import auto_process_due_payouts
    try:
        auto_process_due_payouts(today)
    except Exception:
        # Never let a payout-processing hiccup break the actual request
        # the user is waiting on; it'll simply retry on the next request.
        db.session.rollback()


# ==================================================================
#  AUTOMATED SALARY PAYROLL
#
# Same opportunistic trigger as the incentive payout above, but for the
# 1st-10th-of-month Salary Payroll generation window (base salary + each
# CRM employee's latest finalized incentive amount). See
# salary_payroll_engine.auto_generate_due_salary_payroll /
# SalaryPayrollRun for the idempotency guard.
# ==================================================================

_last_auto_salary_payroll_check = None


@app.before_request
def _maybe_run_auto_salary_payroll():
    global _last_auto_salary_payroll_check

    if not request.path.startswith("/api/v1/"):
        return

    today = date.today()
    if not (1 <= today.day <= 10) or _last_auto_salary_payroll_check == today:
        return
    _last_auto_salary_payroll_check = today

    from api.v1.employee_lifecycle.salary_payroll_engine import (
        auto_generate_due_salary_payroll,
    )
    try:
        auto_generate_due_salary_payroll(today)
    except Exception:
        db.session.rollback()


# ==================================================================
#  AUTOMATED LEAD ASSIGNMENT (9:00 AM daily, when Automatic mode is on)
#
# Same opportunistic-off-real-traffic pattern as the two triggers above:
# the first request on/after 9:00 AM each day checks
# LeadAssignmentSetting.mode, and if it's "Automatic", randomly hands
# every currently-unassigned lead to an active CRM employee (see
# api/v1/crm/leads.run_auto_lead_assignment). Idempotent per day via
# LeadAssignmentSetting.last_auto_run_date, same as the payout/payroll
# checks' own date guards.
# ==================================================================

_last_auto_lead_assignment_check = None


@app.before_request
def _maybe_run_auto_lead_assignment():
    global _last_auto_lead_assignment_check

    if not request.path.startswith("/api/v1/"):
        return

    now = datetime.now()
    today = now.date()
    if now.hour < 9 or _last_auto_lead_assignment_check == today:
        return
    _last_auto_lead_assignment_check = today

    from models import LeadAssignmentSetting
    from api.v1.crm.leads import run_auto_lead_assignment

    try:
        setting = LeadAssignmentSetting.get_or_create()
        if setting.mode == "Automatic" and setting.last_auto_run_date != today:
            run_auto_lead_assignment()
            setting.last_auto_run_date = today
            db.session.commit()
    except Exception:
        db.session.rollback()


@app.route("/")
def home():
    return {
        "message": "HRMS API Running"
    }


if __name__ == "__main__":
    app.run(debug=True)