"""Tạo ảnh WebP bằng Pillow có sẵn trên máy, không thêm dependency runtime."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]


def convert(source, *, lossless):
    target = source.with_suffix('.webp')
    with Image.open(source) as original:
        # Giữ kích thước và alpha; logo dùng lossless để không đổi nét/chữ.
        original.save(target, 'WEBP', lossless=lossless, quality=85, method=6)
        with Image.open(target) as optimized:
            assert optimized.size == original.size
            assert optimized.convert('RGBA').getchannel('A').tobytes() == original.convert('RGBA').getchannel('A').tobytes()
            if lossless:
                # RGB của pixel trong suốt hoàn toàn không ảnh hưởng hiển thị.
                expected = Image.alpha_composite(Image.new('RGBA', original.size), original.convert('RGBA'))
                actual = Image.alpha_composite(Image.new('RGBA', optimized.size), optimized.convert('RGBA'))
                assert actual.tobytes() == expected.tobytes()
    before, after = source.stat().st_size, target.stat().st_size
    print(f'{source.relative_to(ROOT)}: {before:,} -> {after:,} bytes ({(1 - after / before) * 100:.1f}% smaller)')


if __name__ == '__main__':
    convert(ROOT / 'src/assets/background.png', lossless=False)
    for name in ('centerlogo', 'GiaoVienLogo', 'HocSinhLogo', 'icon1', 'icon2', 'logo1'):
        convert(ROOT / f'public/{name}.png', lossless=True)
