import fs from 'fs';
import path from 'path';

// Kiểm tra HTML gốc vì tên tab và favicon không được render bởi React.
test('tên tab, mô tả và favicon thống nhất thương hiệu Eklasses', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../public/index.html'), 'utf8');
  const document = new DOMParser().parseFromString(html, 'text/html');
  expect(document.title).toBe('Eklasses - Quản lý lớp học trực tuyến');
  expect(document.querySelector('meta[name="description"]').content).toMatch(/^Eklasses - /);
  expect(html).not.toMatch(/edututor/i);
  const icon = document.querySelector('link[rel="icon"]');
  expect(icon.getAttribute('href')).toBe('%PUBLIC_URL%/centerlogo.webp');
  expect(icon.type).toBe('image/webp');
  expect(fs.existsSync(path.resolve(__dirname, '../public/centerlogo.webp'))).toBe(true);
});
