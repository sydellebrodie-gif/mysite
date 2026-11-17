export default function Home() {
  return (
    <main className="container" style={{ paddingBlock: 48 }}>
      <h1>מתנות בעיצוב אישי</h1>
      <p>כוסות, תמונות מודפסות, מדבקות ומגבות מטבח, עם התמונה והטקסט שלכם.</p>
      <p style={{ color: "var(--muted)" }}>
        האתר בבנייה. מחיר לדוגמה: <span className="ltr">₪49.90</span> · טלפון לדוגמה:{" "}
        <span className="ltr">050-0000000</span>
      </p>
      <a className="btn" href="#">לקטלוג (בקרוב)</a>
    </main>
  );
}
