import styles from "./StageIndicator.module.css";

const STAGES = [
  { num: 1, label: "כריכה" },
  { num: 2, label: "מספר עמודים" },
  { num: 3, label: "עריכת עמודים" },
  { num: 4, label: "צפייה באלבום" },
  { num: 5, label: "סיום" },
];

export default function StageIndicator({ current }) {
  return (
    <div className={styles.wrap} role="navigation" aria-label="שלבי יצירת האלבום">
      <div className={styles.bar}>
        {STAGES.map((s) => (
          <div
            key={s.num}
            className={
              styles.step +
              (s.num === current ? " " + styles.current : "") +
              (s.num < current ? " " + styles.done : "")
            }
          >
            <span className={styles.num}>{s.num}</span>
            <span className={styles.label}>{s.label}</span>
          </div>
        ))}
      </div>
      <p className={styles.currentLabel + (current === 4 ? " " + styles.currentLabelWhite : "")} aria-live="polite">
        שלב {current}: {STAGES.find((s) => s.num === current)?.label}
      </p>
    </div>
  );
}
