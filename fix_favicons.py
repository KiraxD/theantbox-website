import glob

replacement1 = """<link rel="icon" type="image/x-icon" href="favicon.ico?v=5"/>
<link rel="shortcut icon" type="image/x-icon" href="favicon.ico?v=5"/>"""

replacement2 = """<link rel="icon" type="image/png" sizes="32x32" href="favicon-32x32.png?v=5"/>
<link rel="icon" type="image/png" sizes="16x16" href="favicon-16x16.png?v=5"/>
<link rel="icon" type="image/png" sizes="192x192" href="android-chrome-192x192.png?v=5"/>
<link rel="apple-touch-icon" href="apple-touch-icon.png?v=5"/>
<meta name="msapplication-TileImage" content="android-chrome-192x192.png?v=5"/>"""

for file in ['index.html', 'about.html', 'privacy.html']:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Replace block 1
    content = content.replace('<link rel="icon" type="image/x-icon" href="favicon.ico?v=4"/>\n<link rel="shortcut icon" type="image/x-icon" href="favicon.ico?v=4"/>', replacement1)
    
    # Replace block 2
    old_block2 = '<link rel="icon" type="image/png" sizes="32x32" href="favicon.ico?v=4"/>\n<link rel="icon" type="image/png" sizes="192x192" href="android-chrome-192x192.png?v=4"/>\n<link rel="apple-touch-icon" href="apple-touch-icon.png?v=4"/>\n<meta name="msapplication-TileImage" content="android-chrome-192x192.png?v=4"/>'
    content = content.replace(old_block2, replacement2)
    
    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)

print("Done updating favicons.")
