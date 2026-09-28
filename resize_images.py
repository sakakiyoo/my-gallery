from pathlib import Path
from PIL import Image, ImageOps

BASE_DIR = Path(__file__).resolve().parent
SOURCE_DIR = BASE_DIR / "images" / "images_4K"
OUTPUT_DIR = BASE_DIR / "images"

TARGET_SIZE = (1920, 1080)
EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}

files = [
    p for p in SOURCE_DIR.iterdir()
    if p.is_file() and p.suffix.lower() in EXTENSIONS
]

print(f"{len(files)}枚の4K画像を確認しました。\n")

for source in sorted(files):
    output = OUTPUT_DIR / f"{source.stem}.png"

    try:
        with Image.open(source) as img:
            img = ImageOps.exif_transpose(img)

            # 元画像の縦横比を維持しながら
            # 最大1920×1080に縮小
            img.thumbnail((1920, 1080), Image.Resampling.LANCZOS)

            img.save(
                output,
                "PNG",
                optimize=True
            )

            print(
                f"OK  {source.name} → "
                f"{img.width}×{img.height}"
            )

    except Exception as e:
        print(f"ERROR  {source.name}: {e}")

print("\n全画像の変換が完了しました！")
