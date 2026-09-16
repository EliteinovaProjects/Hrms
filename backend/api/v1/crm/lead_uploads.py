"""
Lead upload — two paths, both restricted to admin or a CRM-department
employee whose Designation contains "Marketing" (see
utils.is_crm_marketing_employee):

  POST /lead-uploads/        — a single .xlsx file (multipart field "file"),
                                one Lead per data row.
  POST /lead-uploads/photo   — a single lead photo (multipart field "file",
                                e.g. a phone-gallery picture of handwritten
                                notes), OCR'd via the OCR.space cloud API to
                                extract a name + contact number into ONE
                                Lead, with the full raw OCR text kept in
                                Lead.notes so a human can verify/correct
                                anything misread.

Both paths share a LeadUploadBatch row (for the existing upload-history
list/deactivate UI) and the same per-lead creation helper so the two
stay in sync.

OCR uses OCR.space's hosted API (https://ocr.space/ocrapi), not a
self-hosted engine (Tesseract/EasyOCR) — this backend deploys as a
Vercel serverless function with a 500MB bundle-size limit, and EasyOCR
alone bundles to ~5.6GB (PyTorch + friends), which fails outright. A
plain HTTP call via `requests` (already a dependency) keeps the bundle
tiny and works identically on any host. Requires OCR_SPACE_API_KEY set
as an environment variable (free key: https://ocr.space/ocrapi/freekey).
"""

import io
import re

import requests
from flask import Blueprint, current_app, jsonify, request, send_file
from flask_jwt_extended import jwt_required
from openpyxl import Workbook, load_workbook

from extensions import db
from models import Lead, LeadUploadBatch
from utils import (
    apply_search_filters,
    fetch_or_404,
    get_current_user,
    is_admin,
    is_crm_marketing_user,
    paginate_query,
    with_token,
)

lead_uploads_bp = Blueprint("lead_uploads_bp", __name__)

ALLOWED_EXTENSIONS = {"xlsx"}
ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg"}
EXPECTED_COLUMNS = ["lead_name", "contact_number", "email", "source", "status", "groom_for_whom", "location"]

# International-ish phone pattern: an optional "+", then 8-15 digits with
# optional spaces/dashes in between — permissive on purpose since OCR text
# is noisy; the extracted match is then stripped down to bare digits (plus
# a leading "+") before being stored.
_PHONE_PATTERN = re.compile(r"\+?\d[\d\s\-]{6,}\d")


def _can_upload_leads(current_user):
    return is_admin(current_user) or is_crm_marketing_user(current_user)


def _allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def _allowed_image(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_IMAGE_EXTENSIONS


OCR_SPACE_ENDPOINT = "https://api.ocr.space/parse/image"


class OcrNotConfiguredError(Exception):
    """Raised when OCR_SPACE_API_KEY isn't set — distinct from a network/
    API failure so the route can return a clear, actionable message."""


def _run_ocr(image_bytes, filename):
    """Sends the image to OCR.space's hosted API and returns the raw
    recognized text. No local model/binary — keeps this backend's
    deployment bundle tiny (see module docstring for why that matters
    on Vercel)."""
    api_key = current_app.config.get("OCR_SPACE_API_KEY")
    if not api_key:
        raise OcrNotConfiguredError()

    response = requests.post(
        OCR_SPACE_ENDPOINT,
        files={"file": (filename, image_bytes)},
        data={
            "apikey": api_key,
            "language": "eng",
            "isOverlayRequired": False,
            "OCREngine": 2,
        },
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()

    if payload.get("IsErroredOnProcessing"):
        error_message = payload.get("ErrorMessage") or payload.get("ErrorDetails") or "OCR failed"
        if isinstance(error_message, list):
            error_message = "; ".join(error_message)
        raise ValueError(error_message)

    parsed_results = payload.get("ParsedResults") or []
    return "\n".join(
        (result.get("ParsedText") or "").strip()
        for result in parsed_results
        if result.get("ParsedText")
    ).strip()


def _build_lead(
    lead_name,
    contact_number=None,
    email=None,
    source="Manual",
    status="New",
    assigned_to=None,
    created_by=None,
    upload_batch_id=None,
    notes=None,
    groom_for_whom=None,
    location=None,
):
    """Single place that shapes a Lead row from raw field values, shared by
    the .xlsx row loop and the photo/OCR path so both stay in sync."""
    return Lead(
        lead_name=str(lead_name).strip()[:150],
        contact_number=(str(contact_number).strip()[:15] if contact_number else None),
        email=(str(email).strip()[:150] if email else None),
        source=(str(source).strip()[:50] if source else "Manual"),
        status=(str(status).strip()[:20] if status else "New"),
        assigned_to=assigned_to,
        created_by=created_by,
        upload_batch_id=upload_batch_id,
        notes=(str(notes).strip() if notes else None),
        groom_for_whom=(str(groom_for_whom).strip()[:150] if groom_for_whom else None),
        location=(str(location).strip()[:150] if location else None),
        is_active=True,
    )


# One notebook-row line, e.g. "53) Mohana - 9176912189 | cousin | Cuddalore"
# or "56 Poornima – 9962845282 / mom / Chennai" — permissive on the leading
# index, the name/number separator, and the field separator (OCR output is
# noisy), but requires a name and a phone-shaped number to count as a row.
_LEAD_ROW_PATTERN = re.compile(
    r"""^\s*
    (?:\(?\d{1,4}\)?[.\):\-]?\s*)?          # optional leading index: "53)", "53.", "(53)"
    (?P<name>[^\-–—|/0-9][^\-–—|]*?)         # name — doesn't start with a digit/dash
    \s*[\-–—]\s*
    (?P<phone>\+?\d[\d\s]{6,}\d)             # phone number
    \s*(?:[|/]\s*(?P<relation>[^|/]+?))?     # optional "| relation"
    \s*(?:[|/]\s*(?P<location>[^|/]+?))?     # optional "| location"
    \s*$""",
    re.VERBOSE,
)


def _extract_lead_records(raw_text):
    """Parses every line of OCR'd text into one lead record per line —
    handles a notebook page listing many rows ("53) Mohana - 9176912189 |
    cousin | Cuddalore"), one Lead per row, instead of a single lead per
    photo. Falls back to a single best-effort Name/Contact extraction (the
    old behaviour) when nothing matches the row pattern, e.g. a photo of
    just one business card.

    Returns a list of dicts: {name, contact_number, groom_for_whom, location}.
    """
    lines = [line.strip() for line in (raw_text or "").splitlines() if line.strip()]

    records = []
    for line in lines:
        # A continuation line (e.g. wrapped relation text on its own line,
        # like "(Priya)" under row 61 in a handwritten list) has no phone
        # number of its own — skip it rather than mis-parsing it as a row.
        match = _LEAD_ROW_PATTERN.match(line)
        if not match:
            continue
        name = (match.group("name") or "").strip(" -–—|/")
        if not name:
            continue
        phone = re.sub(r"[^\d+]", "", match.group("phone") or "")
        relation = (match.group("relation") or "").strip() or None
        location = (match.group("location") or "").strip() or None
        records.append({
            "name": name,
            "contact_number": phone or None,
            "groom_for_whom": relation,
            "location": location,
        })

    if records:
        return records

    # Fallback: single best-effort Name / Contact Number extraction from
    # the whole block of text (e.g. a business card, not a numbered list).
    phone_match = _PHONE_PATTERN.search(raw_text or "")
    contact_number = None
    if phone_match:
        contact_number = re.sub(r"[^\d+]", "", phone_match.group(0))

    name = None
    for line in lines:
        prefixed = re.match(r"(?i)^name\s*[:\-]\s*(.+)$", line)
        if prefixed:
            name = prefixed.group(1).strip()
            break

    if not name:
        for line in lines:
            if phone_match and phone_match.group(0) in line:
                continue
            if re.fullmatch(r"[\d\s+\-]+", line):
                continue
            name = line
            break

    if not name:
        return []

    return [{
        "name": name,
        "contact_number": contact_number,
        "groom_for_whom": None,
        "location": None,
    }]


@lead_uploads_bp.route("/template", methods=["GET"])
@jwt_required()
@with_token
def download_lead_upload_template(token_response):
    """Header-only .xlsx matching EXPECTED_COLUMNS, so the uploader
    doesn't have to guess column names/order by hand."""
    current_user = get_current_user()

    if not _can_upload_leads(current_user):
        return jsonify({"message": "Admin or CRM Marketing privileges required"}), 403

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Leads"
    sheet.append(EXPECTED_COLUMNS)
    # One example row so the format is unambiguous — not required, the
    # uploader can delete it before adding their own rows.
    sheet.append(["Jane Doe", "9876543210", "jane@example.com", "Walk-in", "New", "Self", "Chennai"])

    for column_cells in sheet.columns:
        values = [str(cell.value) for cell in column_cells if cell.value is not None]
        max_length = max((len(v) for v in values), default=10)
        sheet.column_dimensions[column_cells[0].column_letter].width = max(14, max_length + 2)

    buffer = io.BytesIO()
    workbook.save(buffer)
    buffer.seek(0)

    return send_file(
        buffer,
        as_attachment=True,
        download_name="lead_upload_template.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@lead_uploads_bp.route("/", methods=["GET"])  # CHANGED: relative
@jwt_required()
@with_token
def list_lead_uploads(token_response):
    query = LeadUploadBatch.query
    query = apply_search_filters(query, request.args, ["file_name", "status"])
    if request.args.get("is_active") is not None:
        query = query.filter(
            LeadUploadBatch.is_active
            == (request.args.get("is_active").lower() in {"true", "1", "yes"})
        )
    return jsonify(
        {
            "message": "Lead upload batches fetched",
            "data": paginate_query(query, request.args),
            "token_response": token_response,
        }
    ), 200


@lead_uploads_bp.route("/<int:batch_id>", methods=["GET"])  # CHANGED: relative
@jwt_required()
@with_token
def get_lead_upload(batch_id, token_response):
    batch, error_response = fetch_or_404(LeadUploadBatch, batch_id)
    if error_response:
        return error_response
    return jsonify(
        {
            "message": "Lead upload batch fetched",
            "data": batch.to_dict(),
            "token_response": token_response,
        }
    ), 200


@lead_uploads_bp.route("/<int:batch_id>/report", methods=["GET"])
@jwt_required()
@with_token
def download_lead_upload_report(batch_id, token_response):
    """Excel export of every lead a batch produced — Customer Name, Mobile
    Number, Groom For Whom, Location — covering every row in the batch,
    not just the first. Available to admin, or the CRM Marketing employee
    who uploaded that batch themselves, so they can verify what a photo
    upload actually extracted."""
    current_user = get_current_user()

    batch, error_response = fetch_or_404(LeadUploadBatch, batch_id)
    if error_response:
        return error_response

    if not is_admin(current_user) and batch.uploaded_by != current_user.id:
        return jsonify({"message": "You can only download your own uploads"}), 403

    leads = (
        Lead.query.filter(Lead.upload_batch_id == batch_id)
        .order_by(Lead.id.asc())
        .all()
    )

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Leads"
    sheet.append(["Customer Name", "Mobile Number", "Groom For Whom", "Location"])

    for lead in leads:
        sheet.append([
            lead.lead_name or "-",
            lead.contact_number or "-",
            lead.groom_for_whom or "-",
            lead.location or "-",
        ])

    for column_cells in sheet.columns:
        values = [str(cell.value) for cell in column_cells if cell.value is not None]
        max_length = max((len(v) for v in values), default=10)
        sheet.column_dimensions[column_cells[0].column_letter].width = max(16, max_length + 2)

    buffer = io.BytesIO()
    workbook.save(buffer)
    buffer.seek(0)

    return send_file(
        buffer,
        as_attachment=True,
        download_name=f"lead_upload_{batch_id}.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@lead_uploads_bp.route("/", methods=["POST"])
@jwt_required()
@with_token
def upload_leads(token_response):
    current_user = get_current_user()

    if not _can_upload_leads(current_user):
        return jsonify({"message": "Admin or CRM Marketing privileges required"}), 403

    file = request.files.get("file")
    if not file or file.filename == "":
        return jsonify({"message": "No file provided"}), 400

    if not _allowed_file(file.filename):
        return jsonify({"message": "Only .xlsx files are supported"}), 400

    creator_employee_id = None
    try:
        employee = getattr(current_user, "employee", None)
        creator_employee_id = employee.id if employee else None
    except Exception:
        creator_employee_id = None

    assigned_to_raw = request.form.get("assigned_to")
    assigned_to = None
    if assigned_to_raw:
        try:
            assigned_to = int(assigned_to_raw)
        except (TypeError, ValueError):
            return jsonify({"message": "Invalid assigned_to value"}), 400

    # A non-admin (CRM Marketing) login can only ever assign leads to
    # themselves — whatever they submit is overridden, mirroring
    # meetings.py's _attribute_registration pattern, so the UI-level
    # restriction to "just their own name" can't be bypassed via the API.
    if not is_admin(current_user):
        assigned_to = creator_employee_id

    try:
        workbook = load_workbook(file, data_only=True)
    except Exception as exc:
        return jsonify({"message": f"Could not read the uploaded file: {exc}"}), 400

    sheet = workbook.active
    rows = list(sheet.iter_rows(min_row=2, values_only=True))

    if not rows:
        return jsonify({"message": "The uploaded file has no data rows (only a header, or is empty)"}), 400

    batch = LeadUploadBatch(
        uploaded_by=current_user.id,
        file_name=file.filename,
        total_rows=len(rows),
        status="Processing",
    )
    db.session.add(batch)
    db.session.flush()

    success_count = 0
    errors = []

    for index, row in enumerate(rows, start=2):
        try:
            lead_name = row[0] if len(row) > 0 else None
            if not lead_name or not str(lead_name).strip():
                errors.append(f"Row {index}: lead_name is required")
                continue

            lead = _build_lead(
                lead_name=lead_name,
                contact_number=(row[1] if len(row) > 1 else None),
                email=(row[2] if len(row) > 2 else None),
                source=(row[3] if len(row) > 3 and row[3] else "Excel Upload"),
                status=(row[4] if len(row) > 4 and row[4] else "New"),
                assigned_to=assigned_to,
                created_by=creator_employee_id,
                upload_batch_id=batch.id,
                groom_for_whom=(row[5] if len(row) > 5 else None),
                location=(row[6] if len(row) > 6 else None),
            )
            db.session.add(lead)
            success_count += 1
        except Exception as exc:
            errors.append(f"Row {index}: {exc}")
            continue

    batch.success_count = success_count
    batch.failed_count = len(rows) - success_count
    batch.status = "Completed" if batch.failed_count == 0 else "Completed with errors"
    batch.error_summary = "; ".join(errors[:50]) if errors else None

    try:
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        return jsonify({"message": f"Failed to save uploaded leads: {exc}"}), 500

    return jsonify(
        {
            "message": "Lead upload processed",
            "data": batch.to_dict(),
            "token_response": token_response,
        }
    ), 201


@lead_uploads_bp.route("/photo", methods=["POST"])
@jwt_required()
@with_token
def upload_lead_photo(token_response):
    """OCR a single lead photo (phone-gallery picture of handwritten/typed
    notes) into one Lead. Uses EasyOCR (see requirements.txt) — a plain
    pip package, no OS-level binary to install, so this works the same
    on any machine that installed requirements.txt."""
    current_user = get_current_user()

    if not _can_upload_leads(current_user):
        return jsonify({"message": "Admin or CRM Marketing privileges required"}), 403

    file = request.files.get("file")
    if not file or file.filename == "":
        return jsonify({"message": "No image provided"}), 400

    if not _allowed_image(file.filename):
        return jsonify({"message": "Only .png, .jpg or .jpeg image files are supported"}), 400

    creator_employee_id = None
    try:
        employee = getattr(current_user, "employee", None)
        creator_employee_id = employee.id if employee else None
    except Exception:
        creator_employee_id = None

    assigned_to_raw = request.form.get("assigned_to")
    assigned_to = None
    if assigned_to_raw:
        try:
            assigned_to = int(assigned_to_raw)
        except (TypeError, ValueError):
            return jsonify({"message": "Invalid assigned_to value"}), 400

    # Same override as upload_leads: a non-admin login can only assign to
    # themselves, regardless of what's submitted.
    if not is_admin(current_user):
        assigned_to = creator_employee_id

    try:
        raw_text = _run_ocr(file.read(), file.filename)
    except OcrNotConfiguredError:
        return jsonify({
            "message": (
                "OCR is not configured on this server — set OCR_SPACE_API_KEY "
                "(free key at https://ocr.space/ocrapi/freekey)."
            )
        }), 500
    except requests.RequestException as exc:
        return jsonify({"message": f"Could not reach the OCR service: {exc}"}), 502
    except Exception as exc:
        return jsonify({"message": f"Could not read text from the image: {exc}"}), 400

    if not raw_text or not raw_text.strip():
        return jsonify({"message": "No readable text was found in the image"}), 400

    records = _extract_lead_records(raw_text)

    if not records:
        return jsonify({
            "message": "Could not identify any lead rows in the image — please add them manually",
            "data": {"raw_text": raw_text.strip()},
        }), 422

    batch = LeadUploadBatch(
        uploaded_by=current_user.id,
        file_name=file.filename,
        total_rows=len(records),
        status="Processing",
    )
    db.session.add(batch)
    db.session.flush()

    # The full raw OCR text is kept only on the first lead of the batch
    # (rather than duplicated onto every row) so a human can still open it
    # to verify/correct anything misread, without bloating every row.
    leads = []
    for index, record in enumerate(records):
        lead = _build_lead(
            lead_name=record["name"],
            contact_number=record.get("contact_number"),
            source="Photo Upload",
            status="New",
            assigned_to=assigned_to,
            created_by=creator_employee_id,
            upload_batch_id=batch.id,
            groom_for_whom=record.get("groom_for_whom"),
            location=record.get("location"),
            notes=raw_text if index == 0 else None,
        )
        db.session.add(lead)
        leads.append(lead)

    batch.success_count = len(leads)
    batch.failed_count = 0
    batch.status = "Completed"

    try:
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        return jsonify({"message": f"Failed to save the extracted leads: {exc}"}), 500

    return jsonify({
        "message": f"{len(leads)} lead(s) extracted from photo",
        "data": {
            "batch": batch.to_dict(),
            "leads": [lead.to_dict() for lead in leads],
            "raw_text": raw_text.strip(),
        },
        "token_response": token_response,
    }), 201


@lead_uploads_bp.route("/<int:batch_id>/deactivate", methods=["DELETE"])  # CHANGED: relative
@jwt_required()
@with_token
def deactivate_lead_upload(batch_id, token_response):
    current_user = get_current_user()

    if not is_admin(current_user):
        return jsonify({"message": "Admin privileges required"}), 403

    batch, error_response = fetch_or_404(LeadUploadBatch, batch_id)
    if error_response:
        return error_response

    if batch.is_active is False:
        return jsonify(
            {
                "message": "Lead upload batch is already inactive",
                "data": batch.to_dict(),
                "token_response": token_response,
            }
        ), 409

    batch.is_active = False
    db.session.commit()
    return jsonify(
        {
            "message": "Lead upload batch deactivated",
            "data": batch.to_dict(),
            "token_response": token_response,
        }
    ), 200