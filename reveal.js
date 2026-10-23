(() => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;

  const groups = [
    [".home-join"],
    [".home-join .page-title"],
    [".home-join .ways > div"],
    [".home-join .form > label", ".home-join .form > button", ".home-join .form > .fine"],
  ];

  const seen = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("in");
      seen.unobserve(entry.target);
    });
  }, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });

  groups.forEach((selectors) => {
    document.querySelectorAll(selectors.join(",")).forEach((el, i) => {
      el.classList.add("reveal");
      el.style.setProperty("--delay", `${i * 90}ms`);
      seen.observe(el);
    });
  });
})();
