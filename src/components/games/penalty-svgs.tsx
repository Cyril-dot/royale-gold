// Striker + keeper SVG rigs ported VERBATIM from the v48 export
// (hand-drawn originals: striker from behind, gold kit, navy 9;
// keeper front-facing teal, headband, oversized gloves).
// Poses are driven by the parent's classes: striker runup/kick/follow/
// celebrate; keeper diving/beaten/hero. No labels in the goal.

export function KeeperSvg() {
  return (
<svg className="kp-svg" viewBox="0 0 120 150" aria-hidden="true">
            <defs>
              <linearGradient id="kpKit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFE98A"/><stop offset=".55" stopColor="#F2C230"/><stop offset="1" stopColor="#C99612"/></linearGradient>
              <linearGradient id="kpGlove" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFDF4"/><stop offset="1" stopColor="#E9E2CC"/></linearGradient>
            </defs>
            
            <g className="kp-leg l">
              <path d="M49 88 L40 118 L37 136" fill="none" stroke="#825C43" strokeWidth="11" strokeLinecap="round"/>
              <path d="M41.5 112 L38.5 124 L37 136" fill="none" stroke="#0EA5A4" strokeWidth="11.5" strokeLinecap="round"/>
              <path d="M41.5 112 L40 118" fill="none" stroke="#FFF6D8" strokeWidth="11.5" strokeLinecap="round"/>
              <path d="M28 137 h19 a3 3 0 0 1 3 3 v4 a3 3 0 0 1 -3 3 h-19 a2 2 0 0 1 -2 -2 v-6 a2 2 0 0 1 2 -2 z" fill="#10131F"/>
              <path d="M30 147 h3.4 v3 h-3.4 z M38 147 h3.4 v3 h-3.4 z M45 147 h3.4 v3 h-3.4 z" fill="#F2C230"/>
            </g>
            <g className="kp-leg r">
              <path d="M71 88 L80 118 L83 136" fill="none" stroke="#825C43" strokeWidth="11" strokeLinecap="round"/>
              <path d="M78.5 112 L81.5 124 L83 136" fill="none" stroke="#0B7373" strokeWidth="11.5" strokeLinecap="round"/>
              <path d="M78.5 112 L80 118" fill="none" stroke="#E8DFC2" strokeWidth="11.5" strokeLinecap="round"/>
              <path d="M73 137 h19 a2 2 0 0 1 2 2 v6 a2 2 0 0 1 -2 2 h-19 a3 3 0 0 1 -3 -3 v-4 a3 3 0 0 1 3 -3 z" fill="#10131F"/>
              <path d="M75 147 h3.4 v3 h-3.4 z M82.5 147 h3.4 v3 h-3.4 z M90 147 h3.4 v3 h-3.4 z" fill="#F2C230"/>
            </g>
            
            <g className="kp-ga l">
              <path d="M42 49 L29 69 L18 87" fill="none" stroke="#0EA5A4" strokeWidth="13.5" strokeLinecap="round"/>
              <path d="M40 47 L30 64" fill="none" stroke="#2DD4BF" strokeWidth="5" strokeLinecap="round" opacity=".75"/>
              <path d="M24 78 L14 92" fill="none" stroke="#085F5F" strokeWidth="3" strokeLinecap="round" opacity=".55"/>
              <circle cx="17" cy="89" r="7.6" fill="#C22828"/>
              <g>
                <rect x="2" y="84" width="25" height="23" rx="9" fill="url(#kpGlove)" stroke="#B9BECB" strokeWidth="1.5"/>
                <circle cx="7.5" cy="84" r="4.8" fill="url(#kpGlove)" stroke="#B9BECB" strokeWidth="1.3"/>
                <circle cx="14.5" cy="82.5" r="5" fill="url(#kpGlove)" stroke="#B9BECB" strokeWidth="1.3"/>
                <circle cx="21.5" cy="84" r="4.8" fill="url(#kpGlove)" stroke="#B9BECB" strokeWidth="1.3"/>
                <ellipse cx="28.5" cy="97" rx="4.6" ry="6.4" fill="url(#kpGlove)" stroke="#B9BECB" strokeWidth="1.3" transform="rotate(-24 28.5 97)"/>
                <path d="M6 99 q8.5 4.5 17 0" fill="none" stroke="#C9CFDD" strokeWidth="1.4" strokeLinecap="round"/>
                <rect x="3" y="102.5" width="23" height="4.6" rx="2.3" fill="#C22828"/>
              </g>
            </g>
            
            <g className="kp-ga r">
              <path d="M78 49 L91 69 L102 87" fill="none" stroke="#0B7373" strokeWidth="13.5" strokeLinecap="round"/>
              <path d="M76 47 L84 62" fill="none" stroke="#2DD4BF" strokeWidth="4.4" strokeLinecap="round" opacity=".6"/>
              <path d="M96 78 L106 92" fill="none" stroke="#085F5F" strokeWidth="3" strokeLinecap="round" opacity=".55"/>
              <circle cx="103" cy="89" r="7.6" fill="#C22828"/>
              <g>
                <rect x="93" y="84" width="25" height="23" rx="9" fill="url(#kpGlove)" stroke="#B9BECB" strokeWidth="1.5"/>
                <circle cx="98.5" cy="84" r="4.8" fill="url(#kpGlove)" stroke="#B9BECB" strokeWidth="1.3"/>
                <circle cx="105.5" cy="82.5" r="5" fill="url(#kpGlove)" stroke="#B9BECB" strokeWidth="1.3"/>
                <circle cx="112.5" cy="84" r="4.8" fill="url(#kpGlove)" stroke="#B9BECB" strokeWidth="1.3"/>
                <ellipse cx="91.5" cy="97" rx="4.6" ry="6.4" fill="url(#kpGlove)" stroke="#B9BECB" strokeWidth="1.3" transform="rotate(24 91.5 97)"/>
                <path d="M97 99 q8.5 4.5 17 0" fill="none" stroke="#C9CFDD" strokeWidth="1.4" strokeLinecap="round"/>
                <rect x="94" y="102.5" width="23" height="4.6" rx="2.3" fill="#C22828"/>
              </g>
            </g>
            
            <path d="M37 85 h46 l3.5 21 h-19.5 l-7 -11 -7 11 h-19.5 z" fill="#101C30"/>
            <path d="M37 85 h5 l.8 19 h-5 z M78 85 h5 l-.8 19 h-5 z" fill="#F2C230" opacity=".9"/>
            <path d="M37 85 h46 l.7 5 h-47.4 z" fill="#0A1424"/>
            
            <path d="M39 45 Q60 38.5 81 45 L85.5 88 Q60 94.5 34.5 88 Z" fill="url(#kpKit)"/>
            <path d="M72 42.5 Q81 44 81.5 45 L85.5 88 Q79 89.8 71 90.8 Z" fill="#085F5F" opacity=".38"/>
            <path d="M35.8 63 Q60 69.5 84.2 63 L85 72 Q60 78.5 35 72 Z" fill="#101C30" opacity=".92"/>
            <path d="M35.8 63 Q60 69.5 84.2 63 L84.6 67 Q60 73.5 35.4 67 Z" fill="#F2C230" opacity=".85"/>
            <path d="M51.5 40.5 L60 51 L68.5 40.5 L65.5 38 L60 45 L54.5 38 Z" fill="#101C30"/>
            <text x="73.5" y="59" fontFamily="Arial, sans-serif" fontSize="11" fontWeight="900" fill="#FFF6D8" textAnchor="middle">1</text>
            <circle cx="47" cy="57" r="2.6" fill="#F2C230"/>
            
            <rect x="54.5" y="35" width="11" height="9" rx="3" fill="#604134"/>
            <circle cx="44.3" cy="25" r="3.5" fill="#825C43"/>
            <circle cx="75.7" cy="25" r="3.5" fill="#825C43"/>
            <circle cx="60" cy="24" r="15.5" fill="#825C43"/>
            <path d="M44.5 22 a15.5 15.5 0 0 1 31 0 l-.5 -5.5 a15.5 12.5 0 0 0 -30 0 Z" fill="#1C1410"/>
            <path d="M44.6 14.8 Q60 10.6 75.4 14.8 L75.2 20.4 Q60 16.4 44.8 20.4 Z" fill="#C22828"/>
            <path d="M44.8 20.4 Q60 16.4 75.2 20.4 L75.1 22 Q60 18.2 44.9 22 Z" fill="#F2C230"/>
            <rect x="73.4" y="15.5" width="4.6" height="6.4" rx="1.6" fill="#9E1B1B" transform="rotate(14 75.7 18.7)"/>
            <ellipse cx="53.8" cy="26.5" rx="2.7" ry="3.1" fill="#FFFDF4"/>
            <ellipse cx="66.2" cy="26.5" rx="2.7" ry="3.1" fill="#FFFDF4"/>
            <circle cx="54.2" cy="27" r="1.5" fill="#14213D"/><circle cx="65.8" cy="27" r="1.5" fill="#14213D"/>
            <circle cx="54.8" cy="26.2" r=".55" fill="#FFF"/><circle cx="66.4" cy="26.2" r=".55" fill="#FFF"/>
            <path d="M49.5 21.8 l7.5 -1.8 M70.5 21.8 l-7.5 -1.8" stroke="#1C1410" strokeWidth="1.9" strokeLinecap="round"/>
            <path d="M60 28.6 l-1.7 4.6 q1.7 1.3 3.4 0" fill="none" stroke="#604134" strokeWidth="1.5" strokeLinecap="round"/>
            <ellipse cx="60" cy="37.2" rx="2.7" ry="1.8" fill="#4A2418"/>
            <ellipse cx="49.8" cy="33" rx="2.6" ry="1.5" fill="#A07E56" opacity=".55"/>
            <ellipse cx="70.2" cy="33" rx="2.6" ry="1.5" fill="#A07E56" opacity=".55"/>
            <path d="M47.5 12.5 a13 13 0 0 1 7 -4" fill="none" stroke="rgba(255,246,216,.35)" strokeWidth="2" strokeLinecap="round"/>
          </svg>
  );
}

// Striker kit is parametrised (shirt gradient + sleeve tones + shirt
// number) so the team picker can re-kit him; defaults are the original
// gold #9. Shorts stay navy and socks gold for every team.
export interface StrikerKit { s1: string; s2: string; s3: string; sl: string; sd: string }
export const GOLD_KIT: StrikerKit = { s1: "#FFD964", s2: "#F2C230", s3: "#D9A41C", sl: "#D9A41C", sd: "#B57F0E" };

export function StrikerSvg({ kit = GOLD_KIT, num = 9 }: { kit?: StrikerKit; num?: number }) {
  return (
<svg viewBox="0 0 80 120" aria-hidden="true">
            <defs>
              <linearGradient id="stKit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={kit.s1}/><stop offset=".6" stopColor={kit.s2}/><stop offset="1" stopColor={kit.s3}/></linearGradient>
            </defs>
            
            <path d="M35 62 L32.5 84 L31 100" fill="none" stroke="#604134" strokeWidth="8.6" strokeLinecap="round"/>
            <path d="M32.8 80 L31.8 88 L31 100" fill="none" stroke="#F2C230" strokeWidth="9" strokeLinecap="round"/>
            <path d="M32.8 80 L32.2 85" fill="none" stroke="#14213D" strokeWidth="9" strokeLinecap="round"/>
            <path d="M21.5 100.5 h18 a2.5 2.5 0 0 1 2.5 2.5 v4 a2.5 2.5 0 0 1 -2.5 2.5 h-18 a2 2 0 0 1 -2 -2 v-5 a2 2 0 0 1 2 -2 z" fill="#10131F"/>
            <path d="M24 109.5 h3 v2.8 h-3 z M31 109.5 h3 v2.8 h-3 z M37.5 109.5 h3 v2.8 h-3 z" fill="#F2C230"/>
            
            <g className="st-leg">
              <path d="M45 62 L49.5 84 L52.5 99" fill="none" stroke="#604134" strokeWidth="8.6" strokeLinecap="round"/>
              <path d="M48.8 80 L50.8 88 L52.5 99" fill="none" stroke="#F2C230" strokeWidth="9" strokeLinecap="round"/>
              <path d="M48.8 80 L49.8 85" fill="none" stroke="#14213D" strokeWidth="9" strokeLinecap="round"/>
              <path d="M44 99.5 h18.5 a2.5 2.5 0 0 1 2.5 2.5 v4 a2.5 2.5 0 0 1 -2.5 2.5 H44 a2 2 0 0 1 -2 -2 v-5 a2 2 0 0 1 2 -2 z" fill="#10131F"/>
              <path d="M47 108.5 h3 v2.8 h-3 z M54 108.5 h3 v2.8 h-3 z M60 108.5 h3 v2.8 h-3 z" fill="#F2C230"/>
            </g>
            
            <g className="st-upper">
              <g className="st-arm l">
                <path d="M28.5 28 L21 40 L17 52" fill="none" stroke={kit.sl} strokeWidth="8.6" strokeLinecap="round"/>
                <path d="M21.5 39 L18.5 47 L16 57" fill="none" stroke="#604134" strokeWidth="6.8" strokeLinecap="round"/>
                <path d="M27 26.5 L22.5 34" fill="none" stroke="#14213D" strokeWidth="3" strokeLinecap="round" opacity=".8"/>
                <circle cx="15.6" cy="59.5" r="3.6" fill="#604134"/>
              </g>
              <g className="st-arm r">
                <path d="M51.5 28 L59 40 L63 52" fill="none" stroke={kit.sd} strokeWidth="8.6" strokeLinecap="round"/>
                <path d="M58.5 39 L61.5 47 L64 57" fill="none" stroke="#4E3428" strokeWidth="6.8" strokeLinecap="round"/>
                <path d="M53 26.5 L57.5 34" fill="none" stroke="#14213D" strokeWidth="3" strokeLinecap="round" opacity=".8"/>
                <circle cx="64.4" cy="59.5" r="3.6" fill="#4E3428"/>
              </g>
              
              <path d="M28.5 51 h23 l2.8 15.5 h-10.6 l-3.7 -7.5 -3.7 7.5 h-10.6 z" fill="#14213D"/>
              <path d="M28.5 51 h4.6 l.7 14 h-4.6 z M46.9 51 h4.6 l-.7 14 h-4.6 z" fill="#F2C230" opacity=".9"/>
              <path d="M28.5 51 h23 l.6 4 h-24.2 z" fill="#0A1424"/>
              
              <path d="M27.5 25.5 Q40 20.8 52.5 25.5 L56 52 Q40 56.8 24 52 Z" fill="url(#stKit)"/>
              <path d="M24.8 30 Q27 40 26.2 51.5 L24 52 Q23.4 40 24.8 30 Z" fill="#14213D" opacity=".9"/>
              <path d="M55.2 30 Q53 40 53.8 51.5 L56 52 Q56.6 40 55.2 30 Z" fill="#14213D" opacity=".9"/>
              <path d="M47 23.4 Q52 24.8 52.5 25.5 L56 52 Q51.5 53.8 46.5 54.6 Z" fill="#B57F0E" opacity=".35"/>
              <path d="M33 22.6 Q40 25.4 47 22.6 L46 26.6 Q40 28.8 34 26.6 Z" fill="#14213D"/>
              <text x="40" y="47.5" fontFamily="Arial, sans-serif" fontSize="19" fontWeight="900" fill="#14213D" textAnchor="middle">{num}</text>
              
              <rect x="36.4" y="19.5" width="7.2" height="6" rx="2.6" fill="#4E3428"/>
              <circle cx="29.6" cy="14.6" r="2.7" fill="#604134"/>
              <circle cx="50.4" cy="14.6" r="2.7" fill="#604134"/>
              <circle cx="40" cy="13" r="10.6" fill="#17100B"/>
              <path d="M31 7.5 a10.6 10.6 0 0 1 12 -3.4 a8.4 8.4 0 0 0 -9.5 5.2 a6 6 0 0 1 -2.5 -1.8 Z" fill="#2A1D13"/>
              <path d="M30.2 17.5 q-1 3.4 .8 5.4 M49.8 17.5 q1 3.4 -.8 5.4" fill="none" stroke="#17100B" strokeWidth="2.6" strokeLinecap="round"/>
            </g>
          </svg>
  );
}
