import glob
import os

html_files = glob.glob('**/*.html', recursive=True)
print(f'Total HTML files found: {len(html_files)}')

favicon_tags = '''  <!-- Standard Favicon -->
  <link rel="icon" href="https://www.mystudentclub.com/favicon.png" sizes="192x192" type="image/png">
  
  <!-- Fallback Shortcut Icon -->
  <link rel="shortcut icon" href="https://www.mystudentclub.com/favicon.ico">'''

count = 0

for filepath in html_files:
    # Skip node_modules or .git if any
    if 'node_modules' in filepath or '.git' in filepath:
        continue
        
    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        # Check if already present
        if 'https://www.mystudentclub.com/favicon.png' in content and 'https://www.mystudentclub.com/favicon.ico' in content:
            continue
            
        if '</head>' in content:
            # If there's an existing favicon tag of another format, we replace or insert before </head>
            new_content = content.replace('</head>', f'{favicon_tags}\n</head>', 1)
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            count += 1
    except Exception as e:
        print(f"Error processing {filepath}: {e}")

print(f'Updated {count} HTML files with favicon links.')
