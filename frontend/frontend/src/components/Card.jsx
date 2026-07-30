export default function Card({ title, subtitle, children, style }) {
  return (
    <div className="card" style={style}>
      {title && <h2 className="card-title">{title}</h2>}
      {subtitle && <p className="card-sub">{subtitle}</p>}
      {children}
    </div>
  );
}
