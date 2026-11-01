import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import "./Landing.css";

// Change these if your routes in App.jsx are named differently.
const ROUTES = {
  landing: "/",
  login: "/login",
  signup: "/signup",
  profileRegister: "/profile-register",
  home: "/home",
};

// Team photo: try .jpg, then .png, else hide (the initial letter shows instead)
function photoFallback(e) {
  const img = e.currentTarget;
  if (!img.dataset.tried) {
    img.dataset.tried = "1";
    img.src = `/${img.dataset.base}.png`;
  } else {
    img.hidden = true;
  }
}

export default function Landing() {
  const navigate = useNavigate();

  const go = (path) => (e) => {
    e.preventDefault();
    navigate(path);
  };

  // The "Get Started" style buttons: send the person to the right place
  const goStart = (e) => {
    e.preventDefault();
    const unsub = onAuthStateChanged(auth, async (user) => {
      unsub();
      if (!user) return navigate(ROUTES.signup);
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        navigate(snap.exists() ? ROUTES.home : ROUTES.profileRegister);
      } catch (err) {
        console.error(err);
        navigate(ROUTES.home);
      }
    });
  };

  // Scroll-reveal animation
  useEffect(() => {
    const els = document.querySelectorAll(".scroll-reveal");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add("is-visible");
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <>
      <header>
        <a href="/" onClick={go(ROUTES.landing)} className="logo-container">
          <img src="/we-are-volunteer-logo.png" alt="We Are Volunteer Logo" className="logo-img" />
          <span className="logo-text">Pebbl</span>
        </a>
        <nav className="nav-links">
          <a href="#about" className="nav-btn">About Us</a>
          <a href="/login" onClick={go(ROUTES.login)} className="nav-btn">Log In</a>
          <a href="/signup" onClick={goStart} className="nav-btn primary-nav-btn">Get Started</a>
        </nav>
      </header>


        <div className="hero-wrapper">
    
          <div className="hero-blob one"></div>
          <div className="hero-blob two"></div>
    
          <span className="pebble p1"></span>
          <span className="pebble p2"></span>
          <span className="pebble p3"></span>
          <span className="pebble p4"></span>
          <span className="pebble p5"></span>

          <main className="hero-container">
      
            <div className="hero-left scroll-reveal">
              <h1 className="hero-title">Connecting <span>Volunteers</span> with Local Communities.</h1>
              <p className="hero-subtitle">
                Join local volunteer groups, discover impactful initiatives around you, and make a real-world difference effortlessly.
              </p>
              <div className="hero-actions">
                <a href="/home" onClick={go(ROUTES.home)} className="btn-large btn-primary">Explore Platform</a>
                <a href="#about" className="btn-large btn-secondary">Learn More</a>
              </div>
            </div>

      
            <div className="hero-right scroll-reveal delay-1">
              <div className="hero-card">
                <img src="/we-are-volunteer-logo.png" alt="We Are Volunteer Logo" className="hero-card-img" />
                <h3>We Are Volunteer</h3>
                <p>Empowering individuals to build cleaner, greener, and supportive communities together.</p>
                <a href="/signup" onClick={goStart} className="btn-large btn-primary" style={{ display: 'block', width: '100%' }}>Join Us Today</a>
              </div>
            </div>
          </main>

  
        <section id="how" className="how-section section-pad">
          <div className="section-inner">
            <div className="section-title-wrap scroll-reveal">
              <h2 className="section-title">How It Works</h2>
            </div>
            <p className="section-subtitle scroll-reveal delay-1">
              Getting started with Pebbl is simple. Three steps stand between you and your next act of kindness.
            </p>

            <div className="how-grid">
        
              <div className="step-card scroll-reveal">
                <div className="step-number">01</div>
                <div className="step-icon">🔍</div>
                <h3>Discover</h3>
                <p>Find volunteer groups near you. Browse causes by location, interest, and impact.</p>
              </div>
        
              <div className="step-card scroll-reveal delay-1">
                <div className="step-number">02</div>
                <div className="step-icon">🤝</div>
                <h3>Join</h3>
                <p>Connect with causes that match your passion. Reach out, sign up, and show up.</p>
              </div>
        
              <div className="step-card scroll-reveal delay-2">
                <div className="step-number">03</div>
                <div className="step-icon">🌍</div>
                <h3>Impact</h3>
                <p>Make a real difference in your community — one small ripple at a time.</p>
              </div>
            </div>
          </div>
        </section>

  
        <section id="causes" className="causes-section section-pad">
          <div className="section-inner">
            <div className="section-title-wrap scroll-reveal">
              <h2 className="section-title">Featured Initiatives</h2>
            </div>
            <p className="section-subtitle scroll-reveal delay-1">
              Hand-picked volunteer drives happening near you right now. Find one that speaks to you and jump in.
            </p>

            <div className="causes-grid">
        
              <div className="cause-card scroll-reveal">
                <span className="cause-icon">🌳</span>
                <h3>Community Tree Planting</h3>
                <p className="cause-desc">Help us green the neighbourhood. Plant native saplings and restore local green cover.</p>
                <span className="cause-tag">📍 Riverside Park</span>
                <a href="/signup" onClick={goStart} className="cause-join">Join Cause <span className="arrow">→</span></a>
              </div>
        
              <div className="cause-card scroll-reveal delay-1">
                <span className="cause-icon">🧹</span>
                <h3>Neighborhood Clean-Up</h3>
                <p className="cause-desc">A morning sweep of streets, parks, and alleyways to keep our community spotless.</p>
                <span className="cause-tag">📍 Downtown</span>
                <a href="/signup" onClick={goStart} className="cause-join">Join Cause <span className="arrow">→</span></a>
              </div>
        
              <div className="cause-card scroll-reveal delay-2">
                <span className="cause-icon">📚</span>
                <h3>Reading Mentorship</h3>
                <p className="cause-desc">Spend an hour a week reading with young learners who need a little extra support.</p>
                <span className="cause-tag">📍 East Library</span>
                <a href="/signup" onClick={goStart} className="cause-join">Join Cause <span className="arrow">→</span></a>
              </div>
        
              <div className="cause-card scroll-reveal delay-3">
                <span className="cause-icon">🍲</span>
                <h3>Food Drive Support</h3>
                <p className="cause-desc">Sort, pack, and distribute meals to families who need a hand this season.</p>
                <span className="cause-tag">📍 Community Hall</span>
                <a href="/signup" onClick={goStart} className="cause-join">Join Cause <span className="arrow">→</span></a>
              </div>
            </div>
          </div>
        </section>

  
        <section id="about" className="about-section">
          <div className="about-container">
            <div className="section-title-wrap scroll-reveal">
              <h2 className="section-title">About Us</h2>
            </div>

            <p className="about-intro scroll-reveal delay-1">
              Pebbl is built on a simple idea: every small act of kindness creates ripples.
              We make it easy for people to find local volunteer groups, join initiatives
              nearby, and turn good intentions into real action.
            </p>

            <div className="about-grid">
              <div className="about-card scroll-reveal">
                <div className="icon">🎯</div>
                <h3>Our Mission</h3>
                <p>To connect willing volunteers with the communities that need them, so helping out is simple, welcoming, and open to everyone.</p>
              </div>
              <div className="about-card scroll-reveal delay-1">
                <div className="icon">🌱</div>
                <h3>What We Do</h3>
                <p>We bring together local volunteer groups and showcase their initiatives, from community clean-ups to neighbourhood support drives.</p>
              </div>
              <div className="about-card scroll-reveal delay-2">
                <div className="icon">🤝</div>
                <h3>Our Values</h3>
                <p>Kindness, inclusion, and teamwork. Big change starts with ordinary people showing up for each other.</p>
              </div>
            </div>

            <div className="about-story scroll-reveal">
              <h3>Our Story</h3>
              <p>
                Pebbl began as a hackathon project from a team that believes a single pebble
                can start a wave. We saw how hard it can be to find volunteer opportunities
                close to home, so we built a place where people and causes can meet.
              </p>
            </div>
          </div>
        </section>

  
        <section id="team" className="team-section">
          <div className="team-container">
            <div className="scroll-reveal" style={{ textAlign: 'center' }}>
              <div className="team-banner">
          
              </div>
              <h2 className="section-title">Meet the People Behind Pebbl</h2>
              <p className="section-subtitle">
                We are <strong>Nommination</strong> — four friends who believe a single pebble
                can start a wave. Pebbl was born out of a hackathon weekend and a shared
                frustration: wanting to help, but never quite knowing where to start.
                So we built the place we wished existed.
              </p>
            </div>

            <div className="team-grid">
        
              <div className="team-card scroll-reveal">
                <div className="team-avatar">
                  <span className="team-initial">I</span>
                  <img src="/team-iman.jpg" data-base="team-iman" alt="Photo of Iman" className="team-photo" loading="lazy" onError={photoFallback} />
                </div>
                <div className="team-name">Iman Najihah</div>
                <div className="team-role">Project Lead</div>
                <p className="team-bio">Keeps the vision sharp and the team on track. Turns late-night ideas into a clear roadmap.</p>
                <div className="team-socials">
                  <a href="https://www.linkedin.com/in/iman-najihah-yuzli-137694367?fromQR=1" title="Iman Najihah on LinkedIn" aria-label="Iman on LinkedIn">in</a>
                </div>
              </div>

        
              <div className="team-card scroll-reveal">
                <div className="team-avatar">
                  <span className="team-initial">A</span>
                  <img src="/team-ain.jpg" data-base="team-ain" alt="Photo of Ain" className="team-photo" loading="lazy" onError={photoFallback} />
                </div>
                <div className="team-name">Ain Sofea</div>
                <div className="team-role">Product Designer</div>
                <p className="team-bio">Shapes the look and feel of Pebbl — from the warm yellow palette to every button you tap.</p>
                <div className="team-socials">
                  <a href="https://www.linkedin.com/in/ainsofeaa?fromQR=1" title="Ain Sofea on LinkedIn" aria-label="Ain on LinkedIn">in</a>
                </div>
              </div>

        
              <div className="team-card scroll-reveal">
                <div className="team-avatar">
                  <span className="team-initial">A</span>
                  <img src="/team-adriana.jpg" data-base="team-adriana" alt="Photo of Adriana" className="team-photo" loading="lazy" onError={photoFallback} />
                </div>
                <div className="team-name">Shazlin Adriana</div>
                <div className="team-role">Frontend Engineer</div>
                <p className="team-bio">Brings the designs to life in code. Obsessed with smooth animations and clean, accessible markup.</p>
                <div className="team-socials">
                  <a href="https://www.linkedin.com/in/noor-shazlin-adriana-447522400?fromQR=1" title="Shazlin Adriana on LinkedIn" aria-label="Shazlin Adriana on LinkedIn">in</a>
                </div>
              </div>

        
              <div className="team-card scroll-reveal">
                <div className="team-avatar">
                  <span className="team-initial">F</span>
                  <img src="/team-fatin.jpg" data-base="team-fatin" alt="Photo of Fatin" className="team-photo" loading="lazy" onError={photoFallback} />
                </div>
                <div className="team-name">Fatin Fasishah</div>
                <div className="team-role">Community &amp; Outreach</div>
                <p className="team-bio">Builds bridges with local volunteer groups so Pebbl launches with real causes that matter.</p>
                <div className="team-socials">
                  <a href="https://www.linkedin.com/in/fatin-fasishah?utm_source=share_via&utm_content=profile&utm_medium=member_ios" title="Fatin Fasishah on LinkedIn" aria-label="Fatin on LinkedIn">in</a>
                </div>
              </div>
            </div>

            <p className="team-credit scroll-reveal">
              Built with <strong>kindness</strong>, <strong>caffeine</strong>, and a lot of late-night commits by <strong>Team Nommination</strong>.
            </p>
          </div>
        </section>

  

  
        <footer className="site-footer">
          <div className="footer-inner">
            <div className="footer-brand">
              <div className="footer-logo">Pebbl</div>
              <p>We Are Volunteer — connecting willing hands with communities that need them, one ripple at a time.</p>
            </div>
            <div className="footer-links">
              <div className="footer-col">
                <h4>Platform</h4>
                <a href="/" onClick={go(ROUTES.landing)}>Home</a>
                <a href="#about">About Us</a>
                <a href="/home" onClick={go(ROUTES.home)}>Explore</a>
              </div>
              <div className="footer-col">
                <h4>Account</h4>
                <a href="/login" onClick={go(ROUTES.login)}>Log In</a>
                <a href="/signup" onClick={goStart}>Get Started</a>
              </div>
              <div className="footer-col">
                <h4>Discover</h4>
                <a href="#causes">Initiatives</a>
                <a href="#how">How It Works</a>
                <a href="#testimonials">Stories</a>
                <a href="#team">Our Team</a>
              </div>
            </div>
          </div>
          <div className="footer-bottom">
            © {new Date().getFullYear()} Pebbl · We Are Volunteer · A hackathon project.
          </div>
        </footer>
            </div>
    </>
  );
}
