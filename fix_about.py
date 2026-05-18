
with open('about.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = lines[:1010]
new_lines.append('\n<script>\nconst navbar = document.getElementById(\'navbar\');\nlet lastKnownScrollPosition = 0;\nlet ticking = false;\n\nwindow.addEventListener(\'scroll\', () => {\n  lastKnownScrollPosition = window.scrollY;\n\n  if (!ticking) {\n    window.requestAnimationFrame(() => {\n      if (lastKnownScrollPosition > 40) {\n        navbar.classList.add(\'scrolled\');\n      } else {\n        navbar.classList.remove(\'scrolled\');\n      }\n      ticking = false;\n    });\n    ticking = true;\n  }\n}, { passive: true });\n</script>\n</body>\n</html>\n')

with open('about.html', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

