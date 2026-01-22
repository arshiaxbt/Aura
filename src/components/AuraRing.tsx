import { getScoreColor, getScoreLabel } from '~/lib/constants';

interface AuraRingProps {
  score: number | null;
  tier: string;
  size?: number;
  strokeWidth?: number;
}

export function AuraRing({ score, tier, size = 60, strokeWidth = 3 }: AuraRingProps) {
  const color = getScoreColor(score);
  const label = getScoreLabel(score);
  const progress = score !== null ? Math.min(100, Math.max(0, score / 24)) : 0;
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  
  return (
    <div 
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="absolute inset-0 rotate-[-90deg]">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#27272a"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (progress / 100) * circumference}
          style={{
            transition: 'stroke-dashoffset 1s ease-out',
            filter: `drop-shadow(0 0 2px ${color})`
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
        <div 
          className="font-sans font-bold tracking-tight leading-none"
          style={{ color: '#f4f4f5', fontSize: size * 0.28 }}
        >
          {score !== null ? score : '?'}
        </div>
        {score !== null && size >= 60 && (
          <div 
            className="font-sans font-medium uppercase tracking-wider leading-none mt-0.5"
            style={{ color, fontSize: size * 0.12 }}
          >
            {label}
          </div>
        )}
      </div>
    </div>
  );
}
