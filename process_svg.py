import re

with open('msc-ca-fresher-program/assets/destinationdreamjob_animated.svg', 'r') as f:
    svg_lines = f.read().split('\n')

new_svg = []
for line in svg_lines:
    if line.startswith('<svg'):
        # Expand viewBox to be much wider so it natively fits a widescreen area
        line = line.replace('viewBox="0 0 250 250"', 'viewBox="-400 0 1050 250"')
        new_svg.append(line)
    elif '<g class="confetti-strip"' in line:
        new_svg.append(line)
        # Duplicate confetti across the new wider horizontal space
        new_svg.append(line.replace('<g ', '<g transform="translate(-250, 0)" '))
        new_svg.append(line.replace('<g ', '<g transform="translate(-150, 30) scale(0.8)" '))
        new_svg.append(line.replace('<g ', '<g transform="translate(250, 0)" '))
        new_svg.append(line.replace('<g ', '<g transform="translate(150, -20) scale(1.1)" '))
        new_svg.append(line.replace('<g ', '<g transform="translate(-350, -10) scale(1.2)" '))
        new_svg.append(line.replace('<g ', '<g transform="translate(350, 40) scale(0.9)" '))
    else:
        new_svg.append(line)

with open('msc-ca-fresher-program/assets/destinationdreamjob_animated_wide.svg', 'w') as f:
    f.write('\n'.join(new_svg))
print('Done expanding SVG')
