/* Server-renderable form primitives. Logical properties only — RTL-safe. */

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-neutral-600">{label}</span>
      {children}
    </label>
  );
}

const inputCls = "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={inputCls} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={inputCls} />;
}

export function SubmitButton({ label }: { label: string }) {
  return (
    <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">
      {label}
    </button>
  );
}

export function ErrorBanner({ message }: { message: string | undefined }) {
  if (!message) return null;
  return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>;
}

export function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
      {title ? <h2 className="mb-4 text-lg font-semibold">{title}</h2> : null}
      {children}
    </section>
  );
}
