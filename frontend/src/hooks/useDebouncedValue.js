import { useEffect, useState } from 'react';

// Chờ người dùng ngừng gõ trước khi gửi tìm kiếm lên server.
export default function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
