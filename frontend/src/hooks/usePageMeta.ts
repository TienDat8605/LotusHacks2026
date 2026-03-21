import { useEffect } from 'react';

export function usePageMeta(meta: { title: string; description?: string }) {
  useEffect(() => {
    document.title = meta.title;
    if (!meta.description) return;
    const existing = document.querySelector('meta[name="description"]');
    if (existing) {
      existing.setAttribute('content', meta.description);
      return;
    }
    const el = document.createElement('meta');
    el.setAttribute('name', 'description');
    el.setAttribute('content', meta.description);
    document.head.appendChild(el);
  }, [meta.title, meta.description]);
}

