import os
import html as _htmllib

EMAILJS_API_URL   = "https://api.emailjs.com/api/v1.0/email/send"
APP_NAME          = "Arbore Genealogic"

_C_HEADER = "#2d2438"
_C_ACCENT = "#7c6b9e"
_C_BG     = "#efeaf6"
_C_CARD   = "#ffffff"
_C_TEXT   = "#3a3346"
_C_MUTED  = "#8a8198"

def _mesaj_in_html(message: str) -> str:
    blocuri = [b.strip() for b in (message or "").split("\n\n") if b.strip()]
    parts = []
    for b in blocuri:
        linii = _htmllib.escape(b).replace("\n", "<br>")
        parts.append(
            f'<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:{_C_TEXT};">{linii}</p>'
        )
    return "".join(parts)

def construieste_html(to_name: str, message: str, link: str = "",
                      link_label: str = "", heading: str = "", icon: str = "🌳") -> str:
    salut = ""
    if to_name and "@" not in to_name:
        salut = (f'<p style="margin:0 0 14px;font-size:15px;color:{_C_TEXT};">'
                 f'Bună, <strong>{_htmllib.escape(to_name)}</strong>,</p>')

    badge = (
        f'<table role="presentation" cellpadding="0" cellspacing="0" align="center" '
        f'style="margin:0 auto 18px;"><tr><td align="center" valign="middle" '
        f'width="64" height="64" style="width:64px;height:64px;border-radius:50%;'
        f'background:{_C_BG};font-size:30px;line-height:64px;text-align:center;">'
        f'{_htmllib.escape(icon or "🌳")}</td></tr></table>'
    )

    titlu = ""
    if heading:
        titlu = (f'<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;'
                 f'color:{_C_HEADER};font-weight:700;text-align:center;">'
                 f'{_htmllib.escape(heading)}</h1>')

    buton = ""
    if link:
        buton = (
            f'<table role="presentation" cellpadding="0" cellspacing="0" align="center" '
            f'style="margin:26px auto 8px;"><tr><td align="center" '
            f'style="border-radius:10px;background:{_C_ACCENT};">'
            f'<a href="{_htmllib.escape(link, quote=True)}" target="_blank" '
            f'style="display:inline-block;padding:14px 34px;font-size:15px;font-weight:600;'
            f'color:#ffffff;text-decoration:none;border-radius:10px;">'
            f'{_htmllib.escape(link_label or "Deschide")}</a></td></tr></table>'
            f'<p style="margin:10px 0 0;font-size:12px;color:{_C_MUTED};text-align:center;">'
            f'Sau copiază linkul în browser:<br>'
            f'<a href="{_htmllib.escape(link, quote=True)}" '
            f'style="color:{_C_ACCENT};word-break:break-all;">{_htmllib.escape(link)}</a></p>'
        )

    return f"""\
<!DOCTYPE html>
<html lang="ro"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:{_C_BG};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{_C_BG};padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;width:100%;">
  <tr><td align="center" style="padding:0 0 20px;">
    <span style="font-size:24px;font-weight:800;color:{_C_HEADER};">🌳 {APP_NAME}</span>
  </td></tr>
  <tr><td style="background:{_C_CARD};border-radius:18px;padding:34px 32px;
      border-top:4px solid {_C_ACCENT};box-shadow:0 6px 24px rgba(45,36,56,0.08);">
    {badge}{titlu}{salut}{_mesaj_in_html(message)}{buton}
  </td></tr>
  <tr><td align="center" style="padding:22px 0 0;">
    <p style="margin:0;font-size:12px;color:{_C_MUTED};line-height:1.6;">
      Acest email a fost trimis de {APP_NAME} — locul unde păstrezi istoria familiei tale.<br>
      Dacă nu te aștepți la acest mesaj, poți să-l ignori în siguranță.
    </p>
  </td></tr>
</table>
</td></tr></table>
</body></html>"""

def _config() -> dict:
    return {
        "service_id":  os.getenv("EMAILJS_SERVICE_ID", ""),
        "template_id": os.getenv("EMAILJS_TEMPLATE_ID", ""),
        "public_key":  os.getenv("EMAILJS_PUBLIC_KEY", ""),
        "private_key": os.getenv("EMAILJS_PRIVATE_KEY", ""),
    }

def trimite_email(
    to_email: str,
    subject: str,
    message: str,
    *,
    to_name: str = "",
    link: str = "",
    link_label: str = "",
    heading: str = "",
    icon: str = "🌳",
    from_name: str = APP_NAME,
) -> bool:
    cfg = _config()
    if not all(cfg.values()):
        print(f"[DEV EMAIL] -> {to_email} | {subject}\n{message}"
              + (f"\nLink: {link}" if link else ""))
        return True

    html_body = construieste_html(
        to_name=to_name, message=message, link=link,
        link_label=link_label, heading=heading or subject, icon=icon,
    )

    template_params = {
        "to_email":   to_email,
        "email":      to_email,
        "user_email": to_email,
        "recipient":  to_email,
        "to_name":    to_name,
        "from_name":  from_name,
        "subject":    subject,
        "heading":    heading or subject,
        "icon":       icon or "🌳",
        "message":    message,
        "html":       html_body,
        "link":       link,
        "link_label": link_label or "Deschide",
        "app_name":   APP_NAME,
    }

    payload = {
        "service_id":      cfg["service_id"],
        "template_id":     cfg["template_id"],
        "user_id":         cfg["public_key"],
        "accessToken":     cfg["private_key"],
        "template_params": template_params,
    }

    try:
        import httpx
        with httpx.Client(timeout=15) as client:
            res = client.post(
                EMAILJS_API_URL,
                json=payload,
                headers={"Content-Type": "application/json"},
            )
        if res.status_code == 200:
            print(f"[EMAIL OK] {to_email} | {subject}")
            return True
        print(f"[EMAIL ERROR] {res.status_code}: {res.text}")
        return False
    except Exception as e:
        print(f"[EMAIL ERROR] {e}")
        return False
