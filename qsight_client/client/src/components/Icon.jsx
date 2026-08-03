/**
 * 이모지 대체용 아이콘 컴포넌트.
 *
 * 서비스 내 어디에도 이모지(🏠, 👤, 📜 등)를 직접 쓰지 않기 위해,
 * Google Material Symbols Outlined 폰트를 사용하는 이 컴포넌트로 전부 교체한다.
 * 사용법: <Icon name="home" /> — name은 Material Symbols 아이콘 이름 그대로 사용.
 * https://fonts.google.com/icons 에서 이름을 확인할 수 있다.
 */
export default function Icon({ name, size = 22, style = {}, className = "", filled = false, ...rest }) {
  return (
    <span
      className={`material-symbols-outlined ${className}`.trim()}
      style={{
        fontSize: size,
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' ${size}`,
        lineHeight: 1,
        ...style,
      }}
      aria-hidden="true"
      {...rest}
    >
      {name}
    </span>
  );
}
