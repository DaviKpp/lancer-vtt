import { useState } from "react";
import { dice3dEnabled, setDice3dEnabled } from "../obr/dice";

/** Turns the 3D dice on or off on this player's screen (their own throws and everyone else's). */
export function Dice3dToggle() {
  const [on, setOn] = useState(dice3dEnabled);
  const toggle = () => {
    setDice3dEnabled(!on);
    setOn(!on);
  };
  return (
    <div className="card row between dice-toggle">
      <div>
        <strong>Dados 3D</strong>
        <div className="muted small">
          {on
            ? "Ligados: os dados são jogados na tela antes do resultado aparecer."
            : "Desligados na sua tela: o resultado aparece na hora. Os outros jogadores ainda veem os seus dados, se estiverem com os deles ligados."}
        </div>
      </div>
      <button className={`btn-small ${on ? "usage-btn" : ""}`} role="switch" aria-checked={on} onClick={toggle}>
        {on ? "Ligados" : "Desligados"}
      </button>
    </div>
  );
}
