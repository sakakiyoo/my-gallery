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

created = 0
skipped = 0

for source in sorted(files):

    output = OUTPUT_DIR / f"{source.stem}.png"

    # imagesフォルダに同名画像があれば変換済みと判断
    if output.exists():
        skipped += 1
        continue

    try:
        with Image.open(source) as img:

            # 画像の向きを補正
            img = ImageOps.exif_transpose(img)

            # 縦横比を維持しながら1920×1080以内へ縮小
            img.thumbnail(
                TARGET_SIZE,
                Image.Resampling.LANCZOS
            )

            # Gallery用PNGとして保存
            img.save(
                output,
                "PNG",
                optimize=True
            )

            print(
                f"Created: {output.name} "
                f"({img.width}×{img.height})"
            )

            created += 1

    except Exception as e:
        print(f"ERROR: {source.name}: {e}")

print()
print("------------------------------")
print(f"新規作成: {created}枚")
print(f"既存スキップ: {skipped}枚")
print("------------------------------")
