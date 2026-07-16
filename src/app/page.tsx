export default function Home() {
  return (
    <main
      style={{
        display: "flex",
        minHeight: "100dvh",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5rem",
        padding: "2rem",
        textAlign: "center",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
        منصة حلقات البراك
      </h1>
      <p style={{ opacity: 0.6, margin: 0 }}>م٠ — الأساس والأمان</p>
    </main>
  );
}
