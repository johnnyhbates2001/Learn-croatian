import { useEffect, useState } from 'preact/hooks';
import { onToasts } from '../lib/ui';

export function Toasts() {
  const [items, setItems] = useState<{ id: number; icon: string; title: string; body?: string }[]>([]);
  useEffect(() => onToasts(setItems), []);
  return (
    <div class="toasts">
      {items.map((t) => (
        <div class="toast" key={t.id}>
          <span class="toast-icon">{t.icon}</span>
          <div>
            <strong>{t.title}</strong>
            {t.body && <div class="muted">{t.body}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
