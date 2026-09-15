import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { apiGet } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import StudentLayout from '../../components/StudentLayout';
import { Loading, Empty, Badge } from '../../components/ui';

const ABOUT_TEXT = 'مدرسة القمم للنجاح فضاء تعليمي يهدف إلى توفير بيئة تعليمية متميزة، تجمع بين جودة التعليم، المتابعة المستمرة، وتشجيع التلاميذ على تطوير قدراتهم وتحقيق طموحاتهم.';

const FEATURES = [
  { name: 'grad', title: 'تعليم بجودة عالية', desc: 'مناهج حديثة وطرق تدريس مبتكرة تضع التلميذ في قلب العملية التعليمية.', tone: 't-green' },
  { name: 'pulse', title: 'متابعة التلاميذ', desc: 'متابعة فردية ومستمرة لكل تلميذ، من الحضور والأفواج إلى الدفع والحصيلة.', tone: 't-blue' },
  { name: 'users', title: 'أساتذة متخصصون', desc: 'كادر تربوي مؤهل ومتفانٍ، يشرح ويقوم بدقة ووضوح لضمان الفهم.', tone: 't-gold' },
  { name: 'spark', title: 'بيئة تعليمية محفزة', desc: 'أجواء آمنة ومشجّعة تُمكّن التلاميذ من الاجتهاد والتطور باستمرار.', tone: 't-red' }
];

const ABOUT_POINTS = [
  'مناهج حديثة وأساليب تقويم مستمرة',
  'متابعة فردية طوال السنة الدراسية',
  'أنشطة تربوية تعزز القيم والمهارات'
];

const PORTALS = [
  { sub: 'عن مدرستنا ورسالتنا', to: '#about', tone: 'portal-red', icon: 'spark', title: 'اكتشف المدرسة' },
  { sub: 'حسابي واختياراتي ودفعي', to: '/account', tone: 'portal-blue', icon: 'grad', title: 'فضاء التلميذ' },
  { sub: 'آخر أخبار المدرسة وإعلاناتها', to: '#announcements', tone: 'portal-green', icon: 'calendar', title: 'إعلانات المدرسة' },
  { sub: 'أستاذ مادة مستواك وشعبتك', to: '#teachers', tone: 'portal-amber', icon: 'users', title: 'أساتذتي' },
  { sub: 'مستواك وشعبتك وسنّتك', to: '#level', tone: 'portal-violet', icon: 'book', title: 'مستواي الدراسي' }
];

function Icon({ name, size = 22 }) {
  const s = { width: size, height: size, flex: 'none' };
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'grad':
      return (
        <svg viewBox="0 0 24 24" style={s} aria-hidden="true" {...common}>
          <path d="M22 10 12 5 2 10l10 5 10-5z" />
          <path d="M6 12v5c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5v-5" />
          <path d="M22 10v6" />
        </svg>
      );
    case 'pulse':
      return (
        <svg viewBox="0 0 24 24" style={s} aria-hidden="true" {...common}>
          <path d="M3 12h4l2.5-6 4 12 2.5-6h5" />
        </svg>
      );
    case 'users':
      return (
        <svg viewBox="0 0 24 24" style={s} aria-hidden="true" {...common}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M2.5 19c.6-3.2 3.3-5 6.5-5s5.9 1.8 6.5 5" />
          <circle cx="17" cy="9" r="2.6" />
          <path d="M16.2 14.3c2.6.2 4.3 1.7 4.9 4.2" />
        </svg>
      );
    case 'spark':
      return (
        <svg viewBox="0 0 24 24" style={s} aria-hidden="true" {...common}>
          <path d="M12 2.5 14 9l6.5 1.5L14 12l-2 6.5L10 12l-6.5-1.5L10 9l2-6.5z" />
          <path d="M19 16l.9 2.4L22.5 19l-2.6.6L19 22l-.9-2.4L15.5 19l2.6-.6L19 16z" />
        </svg>
      );
    case 'book':
      return (
        <svg viewBox="0 0 24 24" style={s} aria-hidden="true" {...common}>
          <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5v-17z" />
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M9 7h7M9 10.5h5" />
        </svg>
      );
    case 'calendar':
      return (
        <svg viewBox="0 0 24 24" style={s} aria-hidden="true" {...common}>
          <rect x="3.5" y="5" width="17" height="16" rx="3" />
          <path d="M3.5 9.5h17M9 2.8v4M15 2.8v4" />
        </svg>
      );
    case 'check':
      return (
        <svg viewBox="0 0 24 24" style={s} aria-hidden="true" {...common}>
          <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
        </svg>
      );
    case 'arrow':
      return (
        <svg viewBox="0 0 24 24" style={s} aria-hidden="true" {...common}>
          <path d="M4 12h16M13 6l6 6-6 6" />
        </svg>
      );
    default:
      return null;
  }
}

function useReveal(deps = []) {
  const rootRef = useRef(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const els = root.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
    const io = new IntersectionObserver(
      entries => {
        entries.forEach(en => {
          if (!en.isIntersecting) return;
          const el = en.target;
          const d = Number(el.dataset.d || 0);
          window.setTimeout(() => el.classList.add('in'), d * 90);
          io.unobserve(el);
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -36px 0px' }
    );
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, deps);
  return rootRef;
}

function useParallax(deps = []) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const coarse = (window.matchMedia?.('(pointer: coarse)')?.matches ?? false) ||
      (window.matchMedia?.('(hover: none)')?.matches ?? false) ||
      navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
    if (coarse) return;
    const layers = el.querySelectorAll('[data-depth]');
    if (!layers.length) return;
    let raf = 0;
    const onMove = e => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = el.getBoundingClientRect();
        if (!r.width) return;
        const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
        const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
        layers.forEach(l => {
          const d = Number(l.dataset.depth || 0);
          l.style.transform = `translate3d(${(-dx * d).toFixed(2)}px, ${(-dy * d).toFixed(2)}px, 0)`;
        });
      });
    };
    el.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      el.removeEventListener('mousemove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, deps);
  return ref;
}

export default function StudentHome() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, error: null, teachers: [], me: null, announcements: [] });

  useEffect(() => {
    Promise.all([apiGet('/student/teachers'), apiGet('/student/me'), apiGet('/student/announcements')])
      .then(([t, m, an]) => setState(s => ({
        ...s, loading: false, error: null, teachers: t.teachers, me: m.student,
        selectionsCount: m.selections ? m.selections.length : null, announcements: an.announcements
      })))
      .catch(err => {
        if (/غير مفعل/.test(err.message)) logout();
        setState(s => ({ ...s, loading: false, error: err.message }));
      });
  }, [logout]);

  const revealRef = useReveal([state.loading]);
  const parallaxRef = useParallax([state.loading]);

  const me = state.me || {};
  const levelName = me.level_name || '';
  const className = me.class_name ? `شعبة ${me.class_name}` : '';
  const yearName = me.academic_year_name || '';
  const greeting = user?.name || state.me?.first_name || 'تلميذنا الكريم';
  const levelClean = levelName ? levelName.replace(/^مستوى\s*/i, '') : 'التسجيل';

  return (
    <StudentLayout>
      {state.loading ? (
        <div className="page"><div className="container"><Loading /></div></div>
      ) : state.error ? (
        <div className="page"><div className="container">
          <div className="state-box"><div className="big">⚠️</div><div className="title">{state.error}</div></div>
        </div></div>
      ) : (
        <main ref={revealRef}>

          {/* ============ HERO ============ */}
          <section className="home-hero" ref={parallaxRef}>
            <div className="hero-bg" aria-hidden="true">
              <span className="orb orb-a" data-depth="20" />
              <span className="orb orb-b" data-depth="30" />
              <span className="orb orb-c" data-depth="12" />
            </div>
            <img
              src="/images/hero.jpg"
              alt="تلاميذ وأستاذ داخل قسم مدرسة القمم للنجاح"
              className="hero-media"
              loading="eager"
              onError={e => { e.currentTarget.style.display = 'none'; }}
            />
            <div className="hero-overlay" aria-hidden="true" />
            <div className="container hero-inner">
              <div className="hero-copy">
                <span className="hero-logo-chip reveal">
                  <img src="/images/logo-school.jpg" alt="شعار مدرسة القمم للنجاح" />
                </span>
                <span className="hero-kicker reveal">مرحباً بك، {greeting} 👋</span>
                <h1 className="hero-title reveal">مدرسة القمم للنجاح</h1>
                <div className="hero-divider reveal" aria-hidden="true">
                  <span className="hd-green" /><span className="hd-white" /><span className="hd-red" />
                </div>
                <div className="hero-tagline reveal">نصنع المعرفة... ونبني طريق النجاح</div>
                <p className="hero-desc reveal">{ABOUT_TEXT}</p>
                <div className="hero-cta reveal">
                  <a href="#teachers" className="btn hero-btn">استكشف أساتذتك <Icon name="arrow" size={17} /></a>
                  <a href="#announcements" className="btn hero-btn-ghost">إعلانات المدرسة</a>
                </div>
                {(levelName || yearName) && (
                  <div className="hero-chips reveal">
                    {levelName && <span><Icon name="grad" size={16} /> {levelName}</span>}
                    {className && <span><Icon name="users" size={16} /> {className}</span>}
                    {yearName && <span><Icon name="calendar" size={16} /> {yearName}</span>}
                  </div>
                )}
              </div>

              <div className="hero-portals reveal">
                {PORTALS.map((p, i) => {
                  const inner = (
                    <>
                      <span className="portal-icon"><Icon name={p.icon} size={24} /></span>
                      <h3>{p.title}</h3>
                      <p>{p.sub}</p>
                      <span className="portal-arrow"><Icon name="arrow" size={15} /></span>
                    </>
                  );
                  return p.to.startsWith('/') ? (
                    <NavLink to={p.to} className={`portal-card ${p.tone}`} key={p.title}>{inner}</NavLink>
                  ) : (
                    <a href={p.to} className={`portal-card ${p.tone}`} key={p.title}>{inner}</a>
                  );
                })}
              </div>

              <div className="hero-badges reveal">
                <span><Icon name="grad" size={16} /> تعليم بجودة عالية</span>
                <span className="hb-blue"><Icon name="pulse" size={16} /> متابعة مستمرة</span>
                <span className="hb-gold"><Icon name="spark" size={16} /> مستقبل واعد</span>
              </div>
            </div>
          </section>

          {/* ============ الإعلانات ============ */}
          {state.announcements.length > 0 && (
            <section id="announcements" className="home-section announ-sec">
              <div className="container">
                <div className="sec-head reveal">
                  <span className="sec-kicker">الإعلانات</span>
                  <h2 className="sec-title">آخر أخبار المدرسة</h2>
                  <p className="sec-sub">كل جديد من إدارة مدرسة القمم للنجاح تجده هنا أولاً</p>
                </div>
                <div className="announ-grid">
                  {state.announcements.map((a, i) => (
                    <article className={`announ-card reveal ${a.images.length === 0 ? 'no-img' : ''}`} data-d={Math.min(i, 3)} key={a.id}>
                      {a.images[0] && (
                        <div className="announ-photo">
                          <img src={a.images[0]} alt="إعلان المدرسة" loading="lazy" />
                        </div>
                      )}
                      <div className="announ-body">
                        {a.message && <p className="announ-text">{a.message}</p>}
                        {a.images.length > 1 && (
                          <div className="announ-thumbs">
                            {a.images.slice(1).map((img, j) => <img key={j} src={img} alt="" loading="lazy" />)}
                          </div>
                        )}
                        {a.created_at && <span className="announ-date">{String(a.created_at).slice(0, 10)}</span>}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* ============ عن المدرسة + إحصائيات حقيقية ============ */}
          <section id="about" className="home-section about-sec">
            <div className="container">
              <div className="about-grid">
                <div className="about-copy">
                  <span className="sec-kicker reveal">عن المدرسة</span>
                  <h2 className="sec-title reveal">فضاء يتعلّم فيه التلميذ بحب وثقة</h2>
                  <p className="sec-text reveal">{ABOUT_TEXT}</p>
                  <div className="about-tags reveal">
                    <span className="about-tag green">تعليم بجودة عالية</span>
                    <span className="about-tag blue">متابعة مستمرة</span>
                    <span className="about-tag gold">مستقبل واعد</span>
                  </div>
                  <ul className="about-points reveal">
                    {ABOUT_POINTS.map(p => (
                      <li key={p}><span className="pt-ico"><Icon name="check" size={15} /></span> {p}</li>
                    ))}
                  </ul>
                </div>
                <div className="about-stats">
                  <div className="stat-tile green reveal">
                    <div className="num">{state.teachers.length}</div>
                    <div className="lbl">أستاذ متاح لك الآن</div>
                  </div>
                  <div className="stat-tile blue reveal" data-d="1">
                    <div className="num">{state.selectionsCount == null ? '…' : state.selectionsCount}</div>
                    <div className="lbl">اختيار مؤكد</div>
                  </div>
                  <div className="stat-tile gold reveal" data-d="2">
                    <div className="num num-sm">{levelClean}</div>
                    <div className="lbl">المستوى الدراسي</div>
                  </div>
                  <div className="stat-tile red reveal" data-d="3">
                    <div className="num num-sm">{yearName || '—'}</div>
                    <div className="lbl">السنة الدراسية</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ============ لماذا نحن ============ */}
          <section className="home-section features-sec">
            <div className="container">
              <div className="sec-head reveal">
                <span className="sec-kicker">لماذا نحن؟</span>
                <h2 className="sec-title">لماذا مدرسة القمم للنجاح؟</h2>
                <p className="sec-sub">الاستثمار في التعليم هو الاستثمار في المستقبل</p>
              </div>
              <div className="feat-grid">
                {FEATURES.map((f, i) => (
                  <div className="feat-card reveal" data-d={i} key={f.title}>
                    <div className={`feat-icon ${f.tone}`}><Icon name={f.name} size={24} /></div>
                    <h3>{f.title}</h3>
                    <p>{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ============ المستوى الدراسي ============ */}
          <section id="level" className="home-section level-sec">
            <div className="container">
              <div className="sec-head reveal">
                <span className="sec-kicker">المستويات الدراسية</span>
                <h2 className="sec-title">مستواك على المنصة</h2>
                <p className="sec-sub">بياناتك الحالية مسجلة في نظام المدرسة كما هي</p>
              </div>
              <div className="level-card reveal">
                <div className="level-main">
                  <div className="level-badge">
                    <span className="level-star">★</span>
                    {levelClean}
                  </div>
                </div>
                <div className="level-meta">
                  <div className="lmeta-item">
                    <span className="lm-ico"><Icon name="grad" size={16} /></span>
                    <span className="lm-k">المستوى</span>
                    <span className="lm-v">{levelName || '—'}</span>
                  </div>
                  <div className="lmeta-item">
                    <span className="lm-ico"><Icon name="book" size={16} /></span>
                    <span className="lm-k">الشعبة</span>
                    <span className="lm-v">{className || '—'}</span>
                  </div>
                  <div className="lmeta-item">
                    <span className="lm-ico"><Icon name="calendar" size={16} /></span>
                    <span className="lm-k">السنة الدراسية</span>
                    <span className="lm-v">{yearName || '—'}</span>
                  </div>
                  <div className="lmeta-item">
                    <span className="lm-ico"><Icon name="check" size={16} /></span>
                    <span className="lm-k">رقم التسجيل</span>
                    <span className="lm-v mono" dir="ltr">{me.reg_number || '—'}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ============ الأساتذة ============ */}
          <section id="teachers" className="home-section teachers-sec">
            <div className="container">
              <div className="sec-head reveal">
                <span className="sec-kicker">طاقم التدريس</span>
                <h2 className="sec-title">أساتذتك حسب مستواك وشعبتك</h2>
                <p className="sec-sub">انقر على بطاقة الأستاذ لاستعراض أفواجه واختيار فوجك</p>
              </div>
              {state.teachers.length === 0 ? (
                <div className="reveal">
                  <Empty icon="👨‍🏫" title="لا يوجد أساتذة متاحون حالياً." hint="اسأل الإدارة عند ترشيح أساتذة جدد لمستواك." />
                </div>
              ) : (
                <div className="teacher-grid">
                  {state.teachers.map((t, i) => (
                    <div className="teacher-card reveal" data-d={Math.min(i, 5)} key={t.id} onClick={() => navigate(`/teacher/${t.id}`)}>
                      {t.already_selected > 0 && (
                        <div className="done-tag"><Badge kind="green">تم الاختيار ✓</Badge></div>
                      )}
                      <div className="t-band" aria-hidden="true" />
                      <div className="photo">
                        {t.photo ? <img src={t.photo} alt={`${t.first_name} ${t.last_name}`} /> : <span className="ph-fallback">{t.first_name?.charAt(0)}</span>}
                      </div>
                      <div className="t-body">
                        <div className="tname">{t.first_name} {t.last_name}</div>
                        <div className="tsub">{t.subject_name}</div>
                        <div className="tfoot">
                          <span className="btn btn-ghost btn-sm btn-block t-go">عرض الأفواج <Icon name="arrow" size={15} /></span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* ============ دعوة للنجاح ============ */}
          <section className="home-section cta-sec">
            <div className="container">
              <div className="cta-card reveal">
                <h2>طريق النجاح يبدأ بخطوة... ونحن هنا لنرافقك في كل خطوة.</h2>
                <p>تابع أفواجك واختياراتك ودفعك كله من حسابك الشخصي على المنصة.</p>
                <div className="cta-btn-row">
                  <NavLink to="/account" className="btn cta-btn">حسابي الشخصي</NavLink>
                  <a href="#announcements" className="btn cta-btn-ghost">إعلانات المدرسة</a>
                </div>
              </div>
              <div className="cta-note reveal" data-d="1">مدرسة القمم للنجاح — شريكك الأول في الرحلة الدراسية</div>
            </div>
          </section>

        </main>
      )}
    </StudentLayout>
  );
}