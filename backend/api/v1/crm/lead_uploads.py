
"""
Lead upload — two paths, both restricted to admin or a CRM-department
employee whose Designation contains "Marketing".

  POST /lead-uploads/        — .xlsx file
  POST /lead-uploads/photo   — photo OCR'd into MULTIPLE Leads (one per row)

Format in notebook (as per latest spec):
  55) Mohana - 9176912189 | cousin | Cuddalore
  ^index ^name ^phone       ^groom  ^location
  First '-' to first '|' = Mobile Number
  Between first '|' and second '|' = Groom For Whom
  After last '|' = Location
  Before first '-' (after index) = Customer Name
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

# Index like 55) 55. (55) etc
_LEADING_INDEX_RE = re.compile(r"^\s*\(?\d{1,4}\)?\s*[.\):\-]?\s*")
# Phone candidate - allows spaces / - ( ) /
_PHONE_CANDIDATE_RE = re.compile(r"\+?[\d][\d\s\-\/\(\)]{6,}\d")
# Dash variants between name and phone
_DASH_RE = re.compile(r"\s*[-–—]\s*")

OCR_SPACE_ENDPOINT = "https://api.ocr.space/parse/image"

class OcrNotConfiguredError(Exception):
    pass

def _can_upload_leads(current_user):
    return is_admin(current_user) or is_crm_marketing_user(current_user)

def _allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

def _allowed_image(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_IMAGE_EXTENSIONS

def _clean_digits(raw):
    return re.sub(r"[^\d]", "", raw or "")

def _normalize_to_10_digit(raw_phone):
    """Ensures max 10 digits. Fixes 999962738233 -> 9962738233, 979116020068081 -> 9791160200"""
    has_plus = (raw_phone or "").strip().startswith("+")
    d = _clean_digits(raw_phone)
    if not d:
        return ""
    if len(d) == 12 and d.startswith("91") and d[2] in "6789":
        d = d[2:]
    if len(d) <= 10:
        return ("+" + d) if has_plus and len(d) == 10 else d
    # len >10: find best 10-digit window, skip 999... artifacts
    for i in range(len(d) - 9):
        w = d[i:i+10]
        if w[0] not in "6789":
            continue
        if w[0] == w[1] == w[2]:
            continue
        return ("+" + w) if has_plus else w
    for i in range(len(d) - 9):
        w = d[i:i+10]
        if w[0] in "6789":
            return ("+" + w) if has_plus else w
    return d[:10]

def _find_all_phones(line):
    out = []
    seen = []
    for m in _PHONE_CANDIDATE_RE.finditer(line or ""):
        if any(s <= m.start() < e or s < m.end() <= e for s, e in seen):
            continue
        norm = _normalize_to_10_digit(m.group(0))
        if 8 <= len(_clean_digits(norm)) <= 10:
            out.append((m, norm))
            seen.append((m.start(), m.end()))
    return out

def _run_ocr(image_bytes, filename):
    api_key = current_app.config.get("OCR_SPACE_API_KEY")
    if not api_key:
        raise OcrNotConfiguredError()
    response = requests.post(
        OCR_SPACE_ENDPOINT,
        files={"file": (filename, image_bytes)},
        data={"apikey": api_key, "language": "eng", "isOverlayRequired": False, "isTable": True, "OCREngine": 2, "detectOrientation": True, "scale": True},
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    if payload.get("IsErroredOnProcessing"):
        err = payload.get("ErrorMessage") or payload.get("ErrorDetails") or "OCR failed"
        if isinstance(err, list):
            err = "; ".join(err)
        raise ValueError(err)
    parsed = payload.get("ParsedResults") or []
    return "\n".join((r.get("ParsedText") or "").strip() for r in parsed if r.get("ParsedText")).strip()

def _build_lead(lead_name, contact_number=None, email=None, source="Manual", status="New", assigned_to=None, created_by=None, upload_batch_id=None, notes=None, groom_for_whom=None, location=None):
    if contact_number:
        contact_number = _normalize_to_10_digit(str(contact_number))[:15]
    return Lead(
        lead_name=str(lead_name).strip()[:150],
        contact_number=contact_number,
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

def _extract_lead_records(raw_text):
    """
    NEW LOGIC as per user spec:
    Line: 55) Mohana - 9176912189 | cousin | Cuddalore
    - Remove leading index 55)
    - Split by '|' 
        parts[0] = "Mohana - 9176912189" -> split by first '-' -> name = before '-', phone = after '-'
        parts[1] = groom_for_whom (between first | and second |)
        parts[2] = location (after last |)
    This guarantees 12 rows for the provided image.
    """
    lines = [l.strip() for l in (raw_text or "").splitlines() if l.strip()]
    records = []

    for line in lines:
        # Skip lines that are just page header/footer
        if re.match(r"^\s*DOMS", line, re.I):
            continue

        # Remove leading index 55) 56) etc
        no_index = _LEADING_INDEX_RE.sub("", line).strip()
        if not no_index:
            continue

        # If line has no dash and no pipe and no phone -> likely continuation like (Priya)
        phones_in_line = _find_all_phones(no_index)
        
        # ---- CASE 1: Has pipe delimiter (normal case) ----
        if "|" in no_index:
            # Split by pipe - strict per spec
            pipe_parts = [p.strip() for p in no_index.split("|")]
            # Need at least 2 parts (phone part + groom)
            if len(pipe_parts) >= 2:
                first_part = pipe_parts[0]  # contains Name - Phone
                groom = pipe_parts[1] if len(pipe_parts) > 1 else None
                location = "|".join(pipe_parts[2:]).strip() if len(pipe_parts) > 2 else None
                # If location empty but groom present, location might be in groom if only 2 pipes?
                # Actually spec says 2 pipes = 3 parts

                # Now split first_part by dash to get name and phone
                # Example: "Mohana - 9176912189" or "Mohana-9176912189"
                dash_split = _DASH_RE.split(first_part, maxsplit=1)
                if len(dash_split) == 2:
                    name = dash_split[0].strip(" -–—|/\t")
                    phone_raw = dash_split[1].strip()
                    phone = _normalize_to_10_digit(phone_raw)
                    # If phone_raw still contains extra text after phone (rare), extract first phone
                    if len(_clean_digits(phone)) < 8:
                        # fallback to find phone via regex
                        found = _find_all_phones(first_part)
                        if found:
                            phone = found[0][1]
                else:
                    # No dash found, try to find phone in first_part via regex, rest is name
                    found = _find_all_phones(first_part)
                    if found:
                        phone = found[0][1]
                        # name is text before phone match
                        m = found[0][0]
                        name = first_part[:m.start()].strip(" -–—|/\t")
                    else:
                        continue

                # Clean name - remove trailing digits/symbols
                name = re.sub(r"^[\d\W]+", "", name).strip()
                name = re.sub(r"\s{2,}", " ", name).strip()

                if not name or len(name) < 2:
                    continue

                # Groom and location clean - remove dash artifacts
                if groom:
                    groom = groom.strip(" -–—|/\t")
                    if not groom:
                        groom = None
                if location:
                    location = location.strip(" -–—|/\t")
                    if not location:
                        location = None

                # Final phone validation - must be 8-10 digits
                if not phone or len(_clean_digits(phone)) < 8:
                    continue

                records.append({
                    "name": name[:150],
                    "contact_number": phone,
                    "groom_for_whom": groom,
                    "location": location,
                })
                continue

        # ---- CASE 2: No pipe but has dash and phone (OCR misread | as / or space) ----
        # Try to parse as "Name - Phone / Groom / Location" or with 2+ spaces
        if phones_in_line:
            # For lines where OCR merged 2 leads: split into multiple records per phone
            if len(phones_in_line) > 1:
                # e.g. "thana lakshmi 9442453644 vundahk 62) Vani - 9944102521 | ..."
                for idx, (m, norm_phone) in enumerate(phones_in_line):
                    prev_end = phones_in_line[idx-1][0].end() if idx > 0 else 0
                    next_start = phones_in_line[idx+1][0].start() if idx < len(phones_in_line)-1 else len(no_index)
                    before = no_index[prev_end:m.start()]
                    after = no_index[m.end():next_start]

                    # name is before phone, after removing index
                    name = _LEADING_INDEX_RE.sub("", before).strip(" -–—|/\t")
                    # if contains dash, take part before dash as name? Actually name - phone, so before is name
                    # clean
                    name = re.sub(r"\s*[-–—]\s*$", "", name).strip()
                    name = re.sub(r"^[\d\W]+", "", name).strip()

                    # after contains | groom | location
                    if "|" in after:
                        ap = [p.strip() for p in after.split("|")]
                        groom = ap[0] if ap[0] else None
                        loc = ap[1] if len(ap) > 1 else None
                    else:
                        # split by / or 2+ spaces
                        ap = [p.strip() for p in re.split(r"\s+/\s+|\s{2,}", after) if p.strip()]
                        groom = ap[0] if len(ap) > 0 else None
                        loc = ap[1] if len(ap) > 1 else None

                    if name and len(name) >= 2:
                        records.append({"name": name[:150], "contact_number": norm_phone, "groom_for_whom": groom, "location": loc})
                continue
            else:
                # Single phone, no pipe - try dash split
                m, norm_phone = phones_in_line[0]
                before = no_index[:m.start()]
                after = no_index[m.end():]

                # before should contain "Name -"
                # split before by dash
                if "-" in before or "–" in before or "—" in before:
                    b_parts = _DASH_RE.split(before, maxsplit=1)
                    name = b_parts[0].strip()
                else:
                    name = before.strip(" -–—|/\t")

                name = re.sub(r"^[\d\W]+", "", name).strip()
                if not name or len(name) < 2:
                    continue

                # after contains groom | location maybe with / or spaces
                after_clean = after.strip(" -–—|/\t")
                groom = None
                loc = None
                if "|" in after_clean:
                    ap = [p.strip() for p in after_clean.split("|")]
                    groom = ap[0] if ap else None
                    loc = ap[1] if len(ap) > 1 else None
                elif "/" in after_clean:
                    ap = [p.strip() for p in after_clean.split("/") if p.strip()]
                    groom = ap[0] if len(ap) > 0 else None
                    loc = ap[1] if len(ap) > 1 else None
                else:
                    # split by 2+ spaces
                    ap = [p.strip() for p in re.split(r"\s{2,}", after_clean) if p.strip()]
                    groom = ap[0] if len(ap) > 0 else None
                    loc = ap[1] if len(ap) > 1 else None

                records.append({"name": name[:150], "contact_number": norm_phone, "groom_for_whom": groom, "location": loc})
                continue

        # ---- CASE 3: Continuation line like (Priya) ----
        if records:
            extra = line.strip(" -–—|/()").strip()
            if extra and 1 <= len(extra) <= 60 and not _find_all_phones(extra):
                last = records[-1]
                if not last["groom_for_whom"]:
                    last["groom_for_whom"] = extra
                elif not last["location"]:
                    last["location"] = f"{last['location']} {extra}".strip()
                else:
                    last["groom_for_whom"] = f"{last['groom_for_whom']} {extra}".strip()

    return records


@lead_uploads_bp.route("/template", methods=["GET"])
@jwt_required()
@with_token
def download_lead_upload_template(token_response):
    current_user = get_current_user()
    if not _can_upload_leads(current_user):
        return jsonify({"message": "Admin or CRM Marketing privileges required"}), 403
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Leads"
    sheet.append(EXPECTED_COLUMNS)
    sheet.append(["Jane Doe", "9876543210", "jane@example.com", "Walk-in", "New", "Self", "Chennai"])
    for column_cells in sheet.columns:
        values = [str(cell.value) for cell in column_cells if cell.value is not None]
        max_length = max((len(v) for v in values), default=10)
        sheet.column_dimensions[column_cells[0].column_letter].width = max(14, max_length + 2)
    buffer = io.BytesIO()
    workbook.save(buffer)
    buffer.seek(0)
    return send_file(buffer, as_attachment=True, download_name="lead_upload_template.xlsx", mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

@lead_uploads_bp.route("/", methods=["GET"])
@jwt_required()
@with_token
def list_lead_uploads(token_response):
    query = LeadUploadBatch.query
    query = apply_search_filters(query, request.args, ["file_name", "status"])
    if request.args.get("is_active") is not None:
        query = query.filter(LeadUploadBatch.is_active == (request.args.get("is_active").lower() in {"true", "1", "yes"}))
    return jsonify({"message": "Lead upload batches fetched", "data": paginate_query(query, request.args), "token_response": token_response}), 200

@lead_uploads_bp.route("/<int:batch_id>", methods=["GET"])
@jwt_required()
@with_token
def get_lead_upload(batch_id, token_response):
    batch, error_response = fetch_or_404(LeadUploadBatch, batch_id)
    if error_response:
        return error_response
    return jsonify({"message": "Lead upload batch fetched", "data": batch.to_dict(), "token_response": token_response}), 200

@lead_uploads_bp.route("/<int:batch_id>/report", methods=["GET"])
@jwt_required()
@with_token
def download_lead_upload_report(batch_id, token_response):
    current_user = get_current_user()
    if not is_admin(current_user):
        return jsonify({"message": "Admin privileges required"}), 403
    batch, error_response = fetch_or_404(LeadUploadBatch, batch_id)
    if error_response:
        return error_response
    leads = Lead.query.filter(Lead.upload_batch_id == batch_id).order_by(Lead.id.asc()).all()
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Leads"
    sheet.append(["Customer Name", "Mobile Number", "Groom For Whom", "Location"])
    for lead in leads:
        sheet.append([lead.lead_name or "-", lead.contact_number or "-", lead.groom_for_whom or "-", lead.location or "-"])
    for column_cells in sheet.columns:
        values = [str(cell.value) for cell in column_cells if cell.value is not None]
        max_length = max((len(v) for v in values), default=10)
        sheet.column_dimensions[column_cells[0].column_letter].width = max(16, max_length + 2)
    buffer = io.BytesIO()
    workbook.save(buffer)
    buffer.seek(0)
    return send_file(buffer, as_attachment=True, download_name=f"lead_upload_{batch_id}.xlsx", mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

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
    batch = LeadUploadBatch(uploaded_by=current_user.id, file_name=file.filename, total_rows=len(rows), status="Processing")
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
            lead = _build_lead(lead_name=lead_name, contact_number=(row[1] if len(row) > 1 else None), email=(row[2] if len(row) > 2 else None), source=(row[3] if len(row) > 3 and row[3] else "Excel Upload"), status=(row[4] if len(row) > 4 and row[4] else "New"), assigned_to=assigned_to, created_by=creator_employee_id, upload_batch_id=batch.id, groom_for_whom=(row[5] if len(row) > 5 else None), location=(row[6] if len(row) > 6 else None))
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
    return jsonify({"message": "Lead upload processed", "data": batch.to_dict(), "token_response": token_response}), 201

@lead_uploads_bp.route("/photo", methods=["POST"])
@jwt_required()
@with_token
def upload_lead_photo(token_response):
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
    if not is_admin(current_user):
        assigned_to = creator_employee_id
    try:
        raw_text = _run_ocr(file.read(), file.filename)
    except OcrNotConfiguredError:
        return jsonify({"message": "OCR is not configured on this server — set OCR_SPACE_API_KEY (free key at https://ocr.space/ocrapi/freekey)."}), 500
    except requests.RequestException as exc:
        return jsonify({"message": f"Could not reach the OCR service: {exc}"}), 502
    except Exception as exc:
        return jsonify({"message": f"Could not read text from the image: {exc}"}), 400
    if not raw_text or not raw_text.strip():
        return jsonify({"message": "No readable text was found in the image"}), 400
    records = _extract_lead_records(raw_text)
    if not records:
        return jsonify({"message": "Could not identify any lead rows in the image — please add them manually", "data": {"raw_text": raw_text.strip()}}), 422
    batch = LeadUploadBatch(uploaded_by=current_user.id, file_name=file.filename, total_rows=len(records), status="Processing")
    db.session.add(batch)
    db.session.flush()
    leads = []
    for index, record in enumerate(records):
        lead = _build_lead(lead_name=record["name"], contact_number=record.get("contact_number"), source="Photo Upload", status="New", assigned_to=assigned_to, created_by=creator_employee_id, upload_batch_id=batch.id, groom_for_whom=record.get("groom_for_whom"), location=record.get("location"), notes=raw_text if index == 0 else None)
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
    return jsonify({"message": f"{len(leads)} lead(s) extracted from photo", "data": {"batch": batch.to_dict(), "leads": [lead.to_dict() for lead in leads], "raw_text": raw_text.strip()}, "token_response": token_response}), 201

@lead_uploads_bp.route("/<int:batch_id>/deactivate", methods=["DELETE"])
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
        return jsonify({"message": "Lead upload batch is already inactive", "data": batch.to_dict(), "token_response": token_response}), 409
    batch.is_active = False
    db.session.commit()
    return jsonify({"message": "Lead upload batch deactivated", "data": batch.to_dict(), "token_response": token_response}), 200
