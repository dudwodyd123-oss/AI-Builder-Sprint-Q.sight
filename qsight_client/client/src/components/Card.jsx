export default function Card({ title, subtitle, children, style, className }) {
  return (
    <div className={`card${className ? ` ${className}` : ""}`} style={style}>
      {title && <h2 className="card-title">{title}</h2>}
      {subtitle && <p className="card-sub">{subtitle}</p>}
      {children}
    </div>
  );
}
