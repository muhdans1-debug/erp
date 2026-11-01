from PIL import Image

img = Image.open('../sunmi_screen.png')
print("Image Dimensions:", img.size)
# Find the red trash button in the cart row (around y in [150, 240], x in [100, 400])
red_pixels = []
for y in range(150, 250):
    for x in range(100, 450):
        r, g, b = img.getpixel((x, y))[:3]
        if r > 180 and g < 60 and b < 80: # rose-600
            red_pixels.append((x, y))

if red_pixels:
    xs = [p[0] for p in red_pixels]
    ys = [p[1] for p in red_pixels]
    print(f"Red button bounds: x=[{min(xs)}, {max(xs)}], y=[{min(ys)}, {max(ys)}]")
    print(f"Red button center: ({sum(xs)//len(xs)}, {sum(ys)//len(ys)})")
else:
    print("No red pixels found in current screen")
