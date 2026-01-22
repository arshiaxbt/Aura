import { AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import type { SybilFlags } from '~/types/ethos';

interface SybilBadgeProps {
    flags: SybilFlags;
}

export function SybilBadge({ flags }: SybilBadgeProps) {
    if (!flags.hasCircularVouches) return null;

    const colors = {
        low: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
        medium: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
        high: 'bg-red-500/10 border-red-500/30 text-red-400'
    };

    const levelColor = colors[flags.suspicionLevel] || colors.low;

    return (
        <div className={clsx(
            'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs',
            levelColor
        )}>
            <AlertTriangle size={14} />
            <div>
                <span className="font-medium">Circular Vouches: </span>
                <span>{flags.circularVouchCount}</span>
                {flags.circularVouchPartners.length > 0 && (
                    <span className="opacity-70 ml-1">
                        ({flags.circularVouchPartners.slice(0, 3).join(', ')}
                        {flags.circularVouchPartners.length > 3 && '...'})
                    </span>
                )}
            </div>
        </div>
    );
}
