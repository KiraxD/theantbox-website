import sys
from PIL import Image

def generate_favicons(input_path):
    try:
        # Open the source image
        img = Image.open(input_path)
        
        # Ensure it's square for favicons
        # Let's crop or pad it to be square
        width, height = img.size
        size = max(width, height)
        new_img = Image.new("RGBA", (size, size), (255, 255, 255, 0))
        new_img.paste(img, ((size - width) // 2, (size - height) // 2))
        
        # Generate favicon.ico (multi-size)
        icon_sizes = [(16, 16), (32, 32), (48, 48), (64, 64)]
        new_img.save("favicon.ico", format="ICO", sizes=icon_sizes)
        
        # Generate apple-touch-icon (180x180)
        apple_img = new_img.resize((180, 180), Image.Resampling.LANCZOS)
        apple_img.save("apple-touch-icon.png", "PNG")
        
        # Generate android chrome icon (192x192)
        android_192 = new_img.resize((192, 192), Image.Resampling.LANCZOS)
        android_192.save("android-chrome-192x192.png", "PNG")
        
        # Generate android chrome icon (512x512)
        android_512 = new_img.resize((512, 512), Image.Resampling.LANCZOS)
        android_512.save("android-chrome-512x512.png", "PNG")
        
        print("Successfully generated all favicons.")
    except Exception as e:
        print(f"Error generating favicons: {e}")

if __name__ == "__main__":
    generate_favicons("favicon.png")
