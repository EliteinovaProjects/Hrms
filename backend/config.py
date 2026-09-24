import os
from datetime import timedelta
from dotenv import find_dotenv, load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(find_dotenv())


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", SECRET_KEY)
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=8)
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    MAX_CONTENT_LENGTH = 5 * 1024 * 1024
    ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "gif"}
    ALLOWED_DOCUMENT_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "pdf"}
    # Uploaded files (profile pictures, documents, receipts, screenshots)
    # are stored on local disk here and served via /uploads/<path>.
    UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER", os.path.join(BASE_DIR, "uploads"))
    # Base URL used when building file links, e.g. http://localhost:5000.
    # Leave unset to use the host of the incoming request.
    PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL")
    CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]

    SMTP_HOST = os.getenv("SMTP_HOST")
    SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER = os.getenv("SMTP_USER")
    SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
    SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER)
    SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() in {"true", "1", "yes"}
    OTP_EXPIRES_MINUTES = int(os.getenv("OTP_EXPIRES_MINUTES", "10"))

    # RazorpayX payouts — the automated CRM incentive payout (see
    # api/v1/crm/razorpay_gateway.py) uses these to pay incentives out
    # for real once set; with any of the three unset it safely falls
    # back to an internal "Auto (System)" settlement so the payout
    # workflow keeps working with no credentials configured at all.
    # Never hardcode these — set them as real environment variables
    # (.env locally, host env vars in production).
    RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")
    RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")
    # The RazorpayX current account payouts are debited from.
    RAZORPAY_ACCOUNT_NUMBER = os.getenv("RAZORPAY_ACCOUNT_NUMBER")

    # OCR.space free-tier API key for Lead Upload's photo/OCR endpoint —
    # get one at https://ocr.space/ocrapi/freekey (no credit card). A
    # self-hosted OCR engine (Tesseract/EasyOCR) can't run on Vercel's
    # serverless size limit (500MB; EasyOCR alone bundles to ~5.6GB), so
    # this calls OCR.space's hosted API instead — near-zero package size.
    OCR_SPACE_API_KEY = os.getenv("OCR_SPACE_API_KEY")