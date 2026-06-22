import { useEffect, useRef } from 'react';

/**
 * Animated "credit flow" backdrop for the login screen.
 *
 * A field of particles is advected along a smooth, slowly-evolving vector
 * field and drawn as luminous, fading trails — a literal visualization of
 * CredFlow's namesake "flow". Particle colors ride the brand gradient
 * (Trust Blue #255EEB → Cyan #16C7E6 → Green #30D17A), reading as value that
 * flows from request (blue) toward approval / money (green).
 *
 * Dependency-free (canvas 2D), DPR-aware and area-capped for performance,
 * paused while the tab is hidden, and rendered as a single calm static frame
 * under `prefers-reduced-motion`. The canvas stays transparent (trails are
 * erased via `destination-out`) so the page's diagonal navy gradient shows
 * through underneath.
 */

// Brand gradient stops (RGB) — mirrors the wordmark + system palette.
const STOPS: [number, number, number][] = [
  [37, 94, 235], // #255EEB Trust Blue
  [22, 199, 230], // #16C7E6 Cyan
  [48, 209, 122], // #30D17A Green
];

// t in [0,1] → interpolate across the three brand stops.
function colorAt(t: number): [number, number, number] {
  const seg = t >= 0.5 ? 1 : 0;
  const local = t >= 0.5 ? (t - 0.5) * 2 : t * 2;
  const a = STOPS[seg];
  const b = STOPS[seg + 1];
  return [
    a[0] + (b[0] - a[0]) * local,
    a[1] + (b[1] - a[1]) * local,
    a[2] + (b[2] - a[2]) * local,
  ];
}

type Particle = {
  x: number;
  y: number;
  px: number;
  py: number;
  t: number; // color position along the brand gradient
  life: number;
  max: number;
  speed: number;
  glow: number; // occasional brighter "spark" particles
};

export function LoginBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let raf = 0;
    let time = 0;

    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    const spawn = (p: Particle, seed = false) => {
      p.x = Math.random() * width;
      p.y = Math.random() * height;
      p.px = p.x;
      p.py = p.y;
      // Weight the color distribution toward blue/cyan with a green tail.
      p.t = Math.pow(Math.random(), 1.4);
      p.max = rand(140, 340);
      p.life = seed ? Math.random() * p.max : 0;
      p.speed = rand(0.35, 1);
      p.glow = Math.random() < 0.12 ? 1.8 : 1;
    };

    // Smooth, slowly-rotating flow field: layered sines approximate curl noise
    // without a dependency. A gentle up-and-to-the-right bias gives the field
    // an overall current, so it reads as flow rather than random drift.
    const angleAt = (x: number, y: number, tm: number) => {
      const s = 0.0016;
      const nx = x * s;
      const ny = y * s;
      const f =
        Math.sin(nx + tm) +
        Math.sin(ny * 1.3 - tm * 0.8) +
        Math.sin((nx + ny) * 0.7 + tm * 0.5);
      return f * 0.6 - 0.5;
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      // Particle count scales with viewport area, capped for performance.
      const count = Math.min(240, Math.round((width * height) / 8500));
      particles = Array.from({ length: count }, () => {
        const p = {} as Particle;
        spawn(p, true);
        return p;
      });
    };

    const drawStatic = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';
      for (const p of particles) {
        const [r, g, b] = colorAt(p.t);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.45 * p.glow})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    };

    const step = () => {
      time += 0.0016;

      // Erase a sliver of every existing pixel so trails fade to transparent
      // (keeps the canvas see-through over the CSS gradient underneath).
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.045)';
      ctx.fillRect(0, 0, width, height);

      // Additive blending makes overlapping trails glow.
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';

      for (const p of particles) {
        const a = angleAt(p.x, p.y, time);
        p.px = p.x;
        p.py = p.y;
        p.x += Math.cos(a) * p.speed;
        p.y += Math.sin(a) * p.speed;
        p.life++;

        const [r, g, b] = colorAt(p.t);
        // Ease alpha in/out over the lifetime for a soft, breathing field.
        const k = Math.sin((p.life / p.max) * Math.PI);
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${Math.min(0.5, 0.22 * k * p.glow)})`;
        ctx.lineWidth = p.glow > 1 ? 1.7 : 1.2;
        ctx.beginPath();
        ctx.moveTo(p.px, p.py);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();

        if (
          p.life >= p.max ||
          p.x < -20 ||
          p.x > width + 20 ||
          p.y < -20 ||
          p.y > height + 20
        ) {
          spawn(p);
        }
      }

      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(step);
    };

    const start = () => {
      if (reduce) {
        drawStatic();
      } else {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(step);
      }
    };

    const onResize = () => {
      cancelAnimationFrame(raf);
      resize();
      start();
    };

    const onVisibility = () => {
      if (reduce) return;
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(step);
    };

    resize();
    start();

    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />;
}
