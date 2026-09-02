from pathlib import Path

import fitz


PDF_PATH = Path("attached_assets/bst_4_1787980879471.pdf")
OUTPUT_DIR = Path(".agents/outputs/bst-4-inspection")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def render_page(page: fitz.Page, path: Path, zoom: float) -> None:
    pixmap = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    pixmap.save(path)


document = fitz.open(PDF_PATH)
page_count = document.page_count
print(f"pages={page_count}")

text_lengths = []
for index, page in enumerate(document):
    text = page.get_text("text")
    text_lengths.append(len(text.strip()))
    print(f"page={index + 1} text_chars={len(text.strip())} images={len(page.get_images(full=True))}")

sample_pages = sorted({0, 1, 2, 9, 19, 29, page_count - 1})
for index in sample_pages:
    if 0 <= index < page_count:
        render_page(document[index], OUTPUT_DIR / f"page-{index + 1:02d}.png", 1.4)

thumb_width = 220
thumb_height = 310
columns = 5
rows = (page_count + columns - 1) // columns
sheet = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, thumb_width * columns, thumb_height * rows), 0)
sheet.clear_with(255)

for index, page in enumerate(document):
    pixmap = page.get_pixmap(matrix=fitz.Matrix(0.28, 0.28), alpha=False)
    x = (index % columns) * thumb_width + 5
    y = (index // columns) * thumb_height + 5
    sheet.copy(pixmap, fitz.IRect(x, y, x + pixmap.width, y + pixmap.height))

sheet.save(OUTPUT_DIR / "overview.png")
print(f"output={OUTPUT_DIR}")
print(f"selectable_text_total={sum(text_lengths)}")