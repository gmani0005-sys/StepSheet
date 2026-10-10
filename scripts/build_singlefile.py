"""
Packages the built StepSheet web application (apps/web/dist) into a single,
self-contained, zero-dependency HTML file: StepSheet.html
"""
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
DIST_DIR = ROOT_DIR / "apps" / "web" / "dist"
ASSETS_DIR = DIST_DIR / "assets"
OUTPUT_HTML = ROOT_DIR / "StepSheet.html"


def build_single_html() -> Path:
    if not ASSETS_DIR.exists():
        raise FileNotFoundError(
            f"Build assets not found at {ASSETS_DIR}. Run 'npm run build' in apps/web first."
        )

    css_files = sorted(ASSETS_DIR.glob("*.css"))
    js_files = sorted(ASSETS_DIR.glob("*.js"))

    if not js_files:
        raise FileNotFoundError(f"No JS bundle found in {ASSETS_DIR}")

    combined_css = "\n".join(f.read_text(encoding="utf-8") for f in css_files)
    combined_js = "\n".join(f.read_text(encoding="utf-8") for f in js_files)

    # Prevent any literal "</script" inside JS string literals from closing the HTML <script> tag early
    safe_js = combined_js.replace("</script", "<\\/script").replace("</SCRIPT", "<\\/SCRIPT")

    favicon_svg = (
        "data:image/svg+xml;utf8,"
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>"
        "<rect width='32' height='32' rx='8' fill='%2310b981'/>"
        "<path d='M8 10h16M8 16h16M8 22h10' stroke='white' stroke-width='2.5' stroke-linecap='round'/>"
        "</svg>"
    )

    html = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="{favicon_svg}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>StepSheet — No-Code Data Workbench (Standalone Edition)</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
{combined_css}
    </style>
  </head>
  <body class="bg-slate-900 text-slate-100 antialiased font-sans overflow-hidden">
    <div id="root"></div>
    <script>
      window.__STEPSHEET_STANDALONE__ = true;
    </script>
    <script type="module">
{safe_js}
    </script>
  </body>
</html>
"""

    OUTPUT_HTML.write_text(html, encoding="utf-8")
    size_kb = OUTPUT_HTML.stat().st_size / 1024
    print(f"Successfully packaged standalone single-click app: {OUTPUT_HTML} ({size_kb:.1f} KB)")
    return OUTPUT_HTML


if __name__ == "__main__":
    build_single_html()
