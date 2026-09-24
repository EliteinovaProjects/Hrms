from functools import wraps
import os
import smtplib
import uuid
from flask import current_app, jsonify, request
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from werkzeug.security import check_password_hash, generate_password_hash


CRM_DEPARTMENT_NAME = "CRM"
HR_DEPARTMENT_NAME = "HR"
FINANCE_DEPARTMENT_NAME = "Finance"

def serialize_model(item):
    if hasattr(item, "to_dict"):
        return item.to_dict()
    return {column.name: getattr(item, column.name) for column in item.__table__.columns}


def apply_sort(query, args):
    sort_by = args.get("sort_by")
    model = query.column_descriptions[0]["type"]

    if not sort_by:
        # Default listing order: most recently updated record first.
        if hasattr(model, "__table__") and "updated_at" in model.__table__.columns:
            return query.order_by(model.updated_at.desc())
        return query

    if not hasattr(model, "__table__") or sort_by not in model.__table__.columns:
        return query

    column = getattr(model, sort_by)
    sort_dir = (args.get("sort_dir") or "asc").lower()
    return query.order_by(column.desc() if sort_dir == "desc" else column.asc())


def paginate_query(query, args):
    page = int(args.get("page", 1))
    per_page = int(args.get("per_page", 20))
    query = apply_sort(query, args)
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return {
        "items": [serialize_model(item) for item in pagination.items],
        "page": page,
        "per_page": per_page,
        "total": pagination.total,
        "pages": pagination.pages,
    }


def apply_search_filters(query, args, fields):
    search = args.get("search")
    if not search:
        return query

    filters = [getattr(query.column_descriptions[0]["type"], field).ilike(f"%{search}%") for field in fields]
    return query.filter(or_(*filters))


def allowed_file_extension(filename, allowed_extensions):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in allowed_extensions


def handle_image_upload(file, allowed_extensions):
    return handle_upload(file, allowed_extensions, folder="hrms/profile_pictures", resource_type="image")


def handle_feedback_screenshot_upload(file, allowed_extensions):
    return handle_upload(file, allowed_extensions, folder="hrms/feedback_screenshots", resource_type="image")


def handle_document_upload(file, allowed_extensions):
    return handle_upload(file, allowed_extensions, folder="hrms/employee_documents", resource_type="auto")


def handle_upload(file, allowed_extensions, folder, resource_type="auto"):
    """Saves the upload under UPLOAD_FOLDER/<folder>/ on local disk and
    returns an absolute URL served by the /uploads/<path> route in app.py.

    Files get a random UUID name (original extension kept) so names can't
    collide or be guessed from the original filename. resource_type is
    kept only so existing callers don't need to change.
    """
    if not file or file.filename == "":
        return None

    if not allowed_file_extension(file.filename, allowed_extensions):
        raise ValueError("File type not allowed")

    extension = file.filename.rsplit(".", 1)[1].lower()
    relative_path = f"{folder.strip('/')}/{uuid.uuid4().hex}.{extension}"
    absolute_path = os.path.join(current_app.config["UPLOAD_FOLDER"], *relative_path.split("/"))
    os.makedirs(os.path.dirname(absolute_path), exist_ok=True)
    file.save(absolute_path)

    return {
        "url": build_upload_url(relative_path),
        "public_id": relative_path,
        "resource_type": resource_type,
    }


def build_upload_url(relative_path):
    """Absolute URL for a file under UPLOAD_FOLDER. Uses PUBLIC_BASE_URL
    when set, otherwise the host the current request came in on."""
    base_url = current_app.config.get("PUBLIC_BASE_URL") or request.host_url
    return f"{base_url.rstrip('/')}/uploads/{relative_path}"


def parse_datetime(date_str, time_str):
    if not date_str or not time_str:
        return None

    if isinstance(date_str, date):
        date_part = date_str
    else:
        try:
            date_part = datetime.fromisoformat(date_str).date()
        except ValueError:
            return None

    try:
        if isinstance(time_str, datetime):
            time_part = time_str.time()
        else:
            time_part = datetime.fromisoformat(f"{date_part}T{time_str}").time()
    except ValueError:
        return None

    return datetime.combine(date_part, time_part)


def hash_password(password):
    return generate_password_hash(password)


def verify_password(password, hashed_password):
    return check_password_hash(hashed_password, password)


# ---------------------------------------------------------------------------
# OTP / PASSWORD-RESET EMAIL
# ---------------------------------------------------------------------------

def send_otp_email(recipient_email, otp_code):
    """
    Send a password-reset OTP to the user's registered email address.

    SMTP_USER and SMTP_PASSWORD are the admin/system mailbox credentials
    used to authenticate with the SMTP server.  recipient_email is always
    the user's registered email and is the actual destination of the OTP.
    """

    smtp_host = current_app.config.get("SMTP_HOST")
    smtp_port = current_app.config.get("SMTP_PORT", 587)
    smtp_user = current_app.config.get("SMTP_USER")
    smtp_password = current_app.config.get("SMTP_PASSWORD")
    smtp_from = current_app.config.get("SMTP_FROM") or smtp_user
    smtp_use_tls = current_app.config.get("SMTP_USE_TLS", True)
    otp_expires_minutes = current_app.config.get("OTP_EXPIRES_MINUTES", 10)

    if not smtp_host:
        raise RuntimeError("SMTP_HOST is not configured")
    if not smtp_user:
        raise RuntimeError("SMTP_USER is not configured")
    if not smtp_password:
        raise RuntimeError("SMTP_PASSWORD is not configured")
    if not smtp_from:
        raise RuntimeError("SMTP_FROM is not configured")
    if not recipient_email:
        raise ValueError("Recipient email is required")

    subject = "HRMS Password Reset OTP"

    text_body = f"""
Hello,

We received a request to reset your HRMS account password.

Your One-Time Password (OTP) is:

{otp_code}

This OTP will expire in {otp_expires_minutes} minutes.

If you did not request a password reset, please ignore this email.

Regards,
HRMS Administration
""".strip()

    html_body = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>HRMS Password Reset</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f8;padding:40px 15px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 18px rgba(0,0,0,0.08);">
                    <tr>
                        <td style="background-color:#b97808;padding:28px;text-align:center;">
                            <h1 style="margin:0;color:#ffffff;font-size:26px;">HRMS</h1>
                            <p style="margin:8px 0 0;color:#ffffff;font-size:13px;">Human Resource Management System</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:40px 35px;text-align:center;">
                            <h2 style="margin:0 0 15px;color:#222222;font-size:24px;">Password Reset Request</h2>
                            <p style="margin:0 0 25px;color:#666666;font-size:15px;line-height:1.6;">We received a request to reset the password for your HRMS account.</p>
                            <p style="margin:0 0 10px;color:#555555;font-size:14px;">Your verification code is:</p>
                            <div style="display:inline-block;padding:16px 28px;margin:10px 0 20px;background-color:#fff7e6;border:2px dashed #b97808;border-radius:8px;">
                                <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#b97808;">{otp_code}</span>
                            </div>
                            <p style="margin:0 0 20px;color:#777777;font-size:14px;">This OTP will expire in <strong>{otp_expires_minutes} minutes</strong>.</p>
                            <div style="margin-top:25px;padding:15px;background-color:#f8f8f8;border-radius:8px;">
                                <p style="margin:0;color:#666666;font-size:13px;line-height:1.5;">If you did not request a password reset, you can safely ignore this email.</p>
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:20px 30px;background-color:#fafafa;border-top:1px solid #eeeeee;text-align:center;">
                            <p style="margin:0;color:#999999;font-size:12px;">This is an automated email from HRMS. Please do not reply to this message.</p>
                            <p style="margin:8px 0 0;color:#999999;font-size:12px;">HRMS Administration</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
"""

    message = MIMEMultipart("alternative")
    message["Subject"] = subject
    message["From"] = smtp_from
    message["To"] = recipient_email
    message.attach(MIMEText(text_body, "plain", "utf-8"))
    message.attach(MIMEText(html_body, "html", "utf-8"))

    if smtp_use_tls:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(smtp_user, smtp_password)
            server.sendmail(smtp_from, [recipient_email], message.as_string())
    else:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as server:
            server.ehlo()
            server.login(smtp_user, smtp_password)
            server.sendmail(smtp_from, [recipient_email], message.as_string())


# ---------------------------------------------------------------------------
# Shared auth / CRUD-shape helpers reused across the new blueprints (Phase 0+)
# so the `_is_admin`/`_get_current_user`/`with_token` pattern that used to be
# copy-pasted per blueprint file (see master.py, role.py) is implemented once.
# ---------------------------------------------------------------------------

def get_current_user():
    from models import BaseUser
    user_id = int(get_jwt_identity())
    return BaseUser.query.get(user_id)


def is_admin(user):
    return bool(user and user.role == "admin")


def with_token(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            token = get_jwt()
        except Exception:
            token = None
        return func(*args, token_response=token, **kwargs)

    return wrapper


def admin_required(func):
    """Rejects the request with 403 unless the caller is an admin user.
    Combine with @jwt_required() (applied first / outermost)."""

    @wraps(func)
    def wrapper(*args, **kwargs):
        current_user = get_current_user()
        if not is_admin(current_user):
            return jsonify({"message": "Admin privileges required"}), 403
        return func(*args, **kwargs)

    return wrapper


def add_only(func):
    """Applied to PUT (edit) handlers on add-only ("transactional") resources.
    Guarantees the 405 holds no matter what the frontend sends, per the plan's
    full-CRUD-vs-add-only rule enforced at the API layer, not just the UI."""

    @wraps(func)
    def wrapper(*args, **kwargs):
        return jsonify({"message": "Editing is not permitted for this resource"}), 405

    return wrapper


def handle_integrity_error(exc, duplicates=None):
    from extensions import db
    db.session.rollback()
    orig = str(exc.orig).lower() if getattr(exc, "orig", None) else str(exc).lower()
    if duplicates:
        for key, message in duplicates.items():
            if key in orig:
                return jsonify({"message": message}), 409
    return jsonify({"message": "Database integrity error"}), 400


def parse_date(value):
    from datetime import date
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def fetch_or_404(model, item_id, id_name="id"):
    if item_id is None:
        return None, (jsonify({"message": f"{id_name} is required"}), 400)
    try:
        item_id = int(item_id)
    except (TypeError, ValueError):
        return None, (jsonify({"message": f"Invalid {id_name}"}), 400)
    item = model.query.get(item_id)
    if not item:
        return None, (jsonify({"message": f"{model.__name__} not found for the provided id"}), 404)
    return item, None


def is_crm_department(department):
    if not department:
        return False
    return (department.department_name or "").strip().lower() == CRM_DEPARTMENT_NAME.lower()


def is_crm_employee(employee):
    if not employee:
        return False
    return is_crm_department(getattr(employee, "department", None))


def is_hr_department(department):
    if not department:
        return False
    return (department.department_name or "").strip().lower() == HR_DEPARTMENT_NAME.lower()


def is_hr_department_employee(employee):
    if not employee:
        return False
    return is_hr_department(getattr(employee, "department", None))


def is_finance_department(department):
    if not department:
        return False
    return (department.department_name or "").strip().lower() == FINANCE_DEPARTMENT_NAME.lower()


def is_finance_department_employee(employee):
    if not employee:
        return False
    return is_finance_department(getattr(employee, "department", None))


def is_finance_department_user(user):
    """True for a plain "employee"-role login whose Employee record sits in
    the Finance department — the server-side mirror of the Finance sidebar
    section that is only shown to these logins."""
    if not user:
        return False
    from models import Employee
    employee = Employee.query.filter_by(user_id=user.id).first()
    return is_finance_department_employee(employee)


def is_hr_department_user(user):
    """True for a plain "employee"-role login whose Employee record sits
    in the HR department — the read-only HR sidebar (Attendance, Leaves,
    Training, Leave Permissions, Overtime) is only ever shown to these
    logins, so this is the server-side mirror of that gate."""
    if not user:
        return False

    from models import Employee

    employee = Employee.query.filter_by(user_id=user.id).first()
    return is_hr_department_employee(employee)


def is_crm_department_user(user):
    """True for a plain "employee"-role login whose Employee record sits in
    the CRM department — server-side mirror of the read-only CRM incentive
    sidebar."""
    if not user:
        return False
    from models import Employee
    employee = Employee.query.filter_by(user_id=user.id).first()
    return is_crm_employee(employee)


def is_crm_marketing_employee(employee):
    """True for a CRM-department employee whose Designation name contains
    "Marketing" (e.g. "Marketing Executive") — the only CRM employees who
    may reach Lead Upload (spreadsheet or photo/OCR). Designation-based,
    not a separate role/table, so it stays in sync with whatever the
    Designation master already has."""
    if not employee or not is_crm_employee(employee):
        return False
    designation = getattr(employee, "designation", None)
    designation_name = (getattr(designation, "designation_name", None) or "").strip().lower()
    return "marketing" in designation_name


def is_crm_marketing_user(user):
    """Server-side mirror of is_crm_marketing_employee for a plain
    "employee"-role login — the gate used by the Lead Upload endpoints."""
    if not user:
        return False
    from models import Employee
    employee = Employee.query.filter_by(user_id=user.id).first()
    return is_crm_marketing_employee(employee)


def ensure_crm_employee(employee_id):
    """Returns (employee, error_response). error_response is a
    (jsonify, status) tuple if employee_id doesn't resolve to an
    active CRM-department employee."""
    from models import Employee

    if not employee_id:
        return None, (jsonify({"message": "employee_id is required"}), 400)

    employee = Employee.query.get(int(employee_id))
    if not employee:
        return None, (jsonify({"message": "Employee not found"}), 404)

    if not is_crm_employee(employee):
        return None, (jsonify({"message": "Employee must belong to the CRM department"}), 400)

    return employee, None


def ensure_crm_department(department_id):
    from models import Department

    if not department_id:
        return None, (jsonify({"message": "department_id is required"}), 400)

    department = Department.query.get(int(department_id))
    if not department:
        return None, (jsonify({"message": "Department not found"}), 404)

    if not is_crm_department(department):
        return None, (jsonify({"message": "department_id must refer to the CRM department"}), 400)

    return department, None

def register_crud_blueprint(
    name,
    model,
    create_fields,
    search_fields=None,
    update_fields=None,
    editable=True,
    deletable=True,
    admin_only=True,
    view_admin_only=None,
    allowed_roles=None,
    url_prefix_singular=None,
    on_create=None,
    serialize=None,
    filter_fields=None,
    own_employee_scope_field=None,
    view_grant=None,
    base_query_filter=None,
):
    """Factory that builds a Blueprint exposing GET (list) / GET (detail) /
    POST (create) / PUT (edit, only if `editable`) / DELETE (soft-delete
    via is_active=False, only if `deletable`) for a model, following the
    exact response shape and conventions used by master.py / role.py.

    Used for both Master Control (full CRUD, editable=True) and add-only
    module lists (editable=False) so the CRUD-shape isn't re-implemented
    per blueprint file — only the field lists/business hooks differ.

    filter_fields: optional list of column names that should support
    exact-match filtering via query params (e.g. ?holiday_type=Office),
    independent of the fuzzy `search` param built from `search_fields`.

    view_admin_only: gates GET (list/detail) separately from write
    (create/update/delete). Defaults to `admin_only` so existing callers
    keep read+write gated together; pass `False` for resources every
    authenticated user should be able to view (e.g. Holidays) while
    keeping mutations admin-only.

    own_employee_scope_field: for a resource with `view_admin_only=False`
    (open to any authenticated user) that also has a per-employee column
    (e.g. "employee_id"), pass that column name here to force-scope the
    list to the requesting user's own Employee record whenever they
    aren't admin — regardless of what the client sends. Without this, an
    "open" list endpoint would show every employee's records to any
    logged-in employee.

    base_query_filter: optional `callable(query) -> query` applied to the
    list endpoint's base query before search/filter_fields/is_active are
    layered on — e.g. permanently hiding rows that should never be
    listable regardless of any query param (unlike filter_fields, which
    only filters when the client passes that param).
    """
    from extensions import db

    bp = __import__("flask").Blueprint(name, __name__)
    url = name if url_prefix_singular is None else url_prefix_singular
    search_fields = search_fields or []
    filter_fields = filter_fields or []
    update_fields = update_fields if update_fields is not None else create_fields
    serialize = serialize or (lambda item: item.to_dict())
    resolved_view_admin_only = admin_only if view_admin_only is None else view_admin_only

    def _guard():
        user = get_current_user()
        if allowed_roles is not None:
            if not user or user.role not in allowed_roles:
                return jsonify({"message": "You do not have permission to access this resource"}), 403
            return None
        if not admin_only:
            return None
        if not is_admin(user):
            return jsonify({"message": "Admin privileges required"}), 403
        return None

    def _view_guard():
        user = get_current_user()
        # An explicit read-only grant (e.g. a Finance-department "employee"
        # login viewing Payroll) bypasses the role/admin checks below.
        if view_grant is not None and user is not None and view_grant(user):
            return None
        if allowed_roles is not None:
            if not user or user.role not in allowed_roles:
                return jsonify({"message": "You do not have permission to access this resource"}), 403
            return None
        if not resolved_view_admin_only:
            return None
        if not is_admin(user):
            return jsonify({"message": "Admin privileges required"}), 403
        return None

    @jwt_required()
    @with_token
    def list_items(token_response):
        guard = _view_guard()
        if guard:
            return guard

        query = model.query
        if base_query_filter:
            query = base_query_filter(query)

        if own_employee_scope_field and not is_admin(get_current_user()):
            from models import Employee

            current_user = get_current_user()
            own_employee = (
                Employee.query.filter_by(user_id=current_user.id).first()
                if current_user
                else None
            )
            query = query.filter(
                getattr(model, own_employee_scope_field)
                == (own_employee.id if own_employee else -1)
            )

        if search_fields:
            query = apply_search_filters(query, request.args, search_fields)

        # Exact-match filters (e.g. holiday_type=Office), separate from
        # the fuzzy `search` box above.
        for field in filter_fields:
            value = request.args.get(field)
            if value not in (None, "") and hasattr(model, field):
                query = query.filter(getattr(model, field) == value)

        if request.args.get("is_active") is not None and hasattr(model, "is_active"):
            query = query.filter(
                model.is_active == (request.args.get("is_active").lower() in {"true", "1", "yes"})
            )

        return jsonify({
            "message": f"{model.__name__} list fetched",
            "data": paginate_query(query, request.args),
            "token_response": token_response,
        }), 200

    @jwt_required()
    @with_token
    def get_item(item_id, token_response):
        item, error_response = fetch_or_404(model, item_id)
        if error_response:
            return error_response
        return jsonify({"message": f"{model.__name__} fetched", "data": serialize(item), "token_response": token_response}), 200

    @jwt_required()
    @with_token
    def create_item(token_response):
        guard = _guard()
        if guard:
            return guard
        data = request.json or {}
        payload = {field: data.get(field) for field in create_fields if field in data}
        item = model(**payload)
        if on_create:
            hook_response = on_create(item, data)
            if hook_response is not None:
                return hook_response
        db.session.add(item)
        try:
            db.session.commit()
        except IntegrityError as exc:
            return handle_integrity_error(exc)
        return jsonify({"message": f"{model.__name__} created", "data": serialize(item), "token_response": token_response}), 201

    @jwt_required()
    @with_token
    def update_item(item_id, token_response):
        if not editable:
            return jsonify({"message": "Editing is not permitted for this resource"}), 405
        guard = _guard()
        if guard:
            return guard
        item, error_response = fetch_or_404(model, item_id)
        if error_response:
            return error_response
        data = request.json or {}
        for field in update_fields:
            if field in data:
                setattr(item, field, data[field])
        try:
            db.session.commit()
        except IntegrityError as exc:
            return handle_integrity_error(exc)
        return jsonify({"message": f"{model.__name__} updated", "data": serialize(item), "token_response": token_response}), 200

    @jwt_required()
    @with_token
    def delete_item(item_id, token_response):
        if not deletable:
            return jsonify({"message": "Deleting is not permitted for this resource"}), 405
        guard = _guard()
        if guard:
            return guard
        item, error_response = fetch_or_404(model, item_id)
        if error_response:
            return error_response
        item.is_active = False
        db.session.commit()
        return jsonify({"message": f"{model.__name__} deactivated", "token_response": token_response}), 200

    bp.add_url_rule(f"/{url}", f"list_{name}", list_items, methods=["GET"])
    bp.add_url_rule(f"/{url}/<int:item_id>", f"get_{name}", get_item, methods=["GET"])
    bp.add_url_rule(f"/{url}", f"create_{name}", create_item, methods=["POST"])
    bp.add_url_rule(f"/{url}/<int:item_id>", f"update_{name}", update_item, methods=["PUT"])
    bp.add_url_rule(f"/{url}/<int:item_id>", f"delete_{name}", delete_item, methods=["DELETE"])
    return bp