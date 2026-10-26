import { useApp } from '@/context/AppContext';
import { ExternalLink, Network, Zap } from 'lucide-react';

export function OmniRouteView() {
  const { routes } = useApp();

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="card p-6 bg-gradient-to-l from-[var(--bg-card)] to-[var(--bg-elevated)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/15 text-warning font-bold">غير موصول — عرض تخطيطي</span>
            <span className="text-xs text-muted">لا توجد قياسات حية أو مسارات تم اختبارها</span>
          </div>
          <h1 className="font-display font-bold text-2xl text-primary mt-2">إدارة وتوجيه النماذج الذكية (OmniRoute Hub)</h1>
          <p className="text-sm text-secondary mt-1">هذه الشاشة تعرض تعريفات محلية توضيحية فقط؛ لا تُرسل Ping ولا تُظهر اتصالًا أو تكلفة حقيقية.</p>
        </div>
        <a href="#integrations" className="px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-bold flex items-center gap-2 self-start">
          <ExternalLink className="w-4 h-4" /> فتح مركز التكاملات
        </a>
      </div>

      <div className="space-y-4">
        <h3 className="font-display font-bold text-base text-primary flex items-center gap-2">
          <Network className="w-5 h-5 text-accent" /> تعريفات مسارات غير مختبرة
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {routes.map((route) => (
            <div key={route.id} className="card p-5 flex flex-col justify-between gap-4">
              <div>
                <div className="flex items-center justify-between mb-3 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center shrink-0"><Zap className="w-4 h-4 text-accent" /></div>
                    <div className="min-w-0"><h4 className="font-bold text-sm text-primary truncate">{route.name}</h4><span className="text-[10px] text-muted font-mono">{route.id}</span></div>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded-full border border-default text-muted shrink-0">غير موصول</span>
                </div>
                <div className="p-3 rounded-xl bg-elevated border border-default space-y-2 text-xs mb-3">
                  <div className="flex items-start justify-between gap-3"><span className="text-muted shrink-0">المصدر:</span><span className="font-medium text-secondary text-left">{route.source}</span></div>
                  <div className="flex items-start justify-between gap-3"><span className="text-muted shrink-0">الوجهة المقترحة:</span><span className="font-bold text-secondary text-left">{route.destination}</span></div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-[var(--bg-card)] border border-default text-center"><span className="text-muted block text-[10px]">معدل المعالجة</span><span className="font-bold text-muted">غير مقاس</span></div>
                  <div className="p-2.5 rounded-lg bg-[var(--bg-card)] border border-default text-center"><span className="text-muted block text-[10px]">زمن الاستجابة</span><span className="font-bold text-muted">غير مقاس</span></div>
                </div>
              </div>
              <div className="pt-3 border-t border-default flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted">التكلفة: غير متاحة قبل ربط المزود</span>
                <a href="#integrations" className="text-xs text-accent hover:underline font-bold">اختبر الإعداد من المركز</a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
