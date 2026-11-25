/** Ambient warm aura behind the Claw page (styles + motion in styles/pages/claw.css). */
export default function ClawAura() {
  return (
    <div className="claw-aura" aria-hidden="true">
      <div className="claw-aura__in">
        <i />
        <i />
        <i />
        <i />
        <b className="claw-wave claw-wave--1" />
        <b className="claw-wave claw-wave--2" />
        <b className="claw-wave claw-wave--3" />
      </div>
    </div>
  );
}
