from PIL import Image
import os
import sys

def split_image(image_path):
    img = Image.open(image_path).convert("RGBA")
    width, height = img.size
    mid_width = width // 2

    base_dir = os.path.dirname(os.path.abspath(image_path))

    left_img = img.crop((0, 0, mid_width, height))
    left_filename = os.path.join(base_dir, "left_text_image.png")
    left_img.save(left_filename)

    right_img = img.crop((mid_width, 0, width, height))
    right_filename = os.path.join(base_dir, "right_doothing_image.png")
    right_img.save(right_filename)

    print("OK split:")
    print(" - left:  " + left_filename)
    print(" - right: " + right_filename)

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "두띵.png"
    here = os.path.dirname(os.path.abspath(__file__))
    full = os.path.join(here, target)
    split_image(full)
