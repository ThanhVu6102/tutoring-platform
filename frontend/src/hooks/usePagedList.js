import { useCallback, useEffect, useRef, useState } from 'react';
import { getList } from '../utils/listRequests';

// Giữ dữ liệu cũ khi đổi trang; bỏ response cũ khi URL/filter/tài khoản đổi.
// Tab đã tải được giữ trong vòng đời component, chỉ tải lại khi gọi reload.
export default function usePagedList(url, params = {}, enabled = true) {
  const serialized = JSON.stringify(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)));
  const rootKey = JSON.stringify([url, serialized, localStorage.getItem('token')]);
  const [selection, setSelection] = useState({ key: rootKey, page: 1 });
  const page = selection.key === rootKey ? selection.page : 1;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({});
  const loaded = useRef('');
  const requestKey = `${rootKey}:${page}:${revision}`;
  useEffect(() => {
    if (!url || !enabled || loaded.current === requestKey) return undefined;
    let active = true;
    setState((old) => ({ ...(old.key === rootKey ? old : {}), key: rootKey, loading: true, error: '' }));
    getList(url, { ...Object.fromEntries(JSON.parse(serialized)), page, limit: 20 })
      .then((result) => {
        if (!active) return;
        // Xóa phần tử cuối có thể làm trang hiện tại không còn tồn tại.
        if (page > Math.max(1, result.totalPages)) {
          setSelection({ key: rootKey, page: Math.max(1, result.totalPages) });
          return;
        }
        loaded.current = requestKey;
        setState({ ...result, key: rootKey, loading: false, error: '' });
      }).catch((error) => {
        if (active) setState((old) => ({ ...old, loading: false,
          error: error.response?.data?.message || 'Không thể tải danh sách. Vui lòng thử lại.',
          errorStatus: error.response?.status, errorData: error.response?.data }));
      });
    return () => { active = false; };
  }, [url, serialized, rootKey, page, requestKey, enabled]);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  const setPage = useCallback((value) => setSelection({ key: rootKey, page: value }), [rootKey]);
  const current = state.key === rootKey ? state : {};
  return { data: [], total: 0, totalPages: 0, loading: Boolean(url && enabled), error: '',
    ...current, page, setPage, reload };
}
