"""Rebuild editable Word resources from their checked-in PDF text.

Requires python-docx and pdfplumber. Recreates editable paragraphs/tables, rather
than embedding page screenshots. Original PDF previews remain unchanged. Run
render_docx.py on every generated file and inspect all pages before release.
"""
from pathlib import Path
import re
import pdfplumber
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT=Path(__file__).resolve().parents[1]
HEADINGS={
 'CV Template-1':['About','Education','Professional Experience','Certifications & Recognition','Skills & Hobbies'],
 'CV Template-2':['EDUCATION','WORK EXPERIENCE','POSITIONS OF LEADERSHIP','EXTRA-CURRICULAR ACTIVITIES & ACHIEVEMENTS','INTEREST AND HOBBIES','SIGNIFICANT AWARDS & CERTIFICATIONS','ADDITIONAL SKILLS'],
 'Industrial_Training_CV_Template_1':['ACADEMIC QUALIFICATIONS','WORK EXPERIENCE','POSITIONS OF LEADERSHIP','COURSES & CERTIFICATIONS','EXTRA-CURRICULAR ACTIVITIES & ACHIEVEMENTS','ADDITIONAL SKILLS'],
 'Industrial_Training_CV_Template_2':['PROFESSIONAL/ACADEMIC QUALIFICATION','EXPERIENCE','TECHNICAL SKILLS: OTHER SKILLS:','ADDITIONAL INFORMATION:']
}
TABLES={
 'CV Template-2':[
 ['COURSE','YEAR','INSTITUTION','MARKS','REMARKS'],
 ['CA Final','Nov 2024','ICAI','408/600 (68.0%)','State Rank 1'],
 ['CA Intermediate','Dec 2021','ICAI','380/600 (63.3%)','Mumbai City Rank 3'],
 ['CA Foundation','Dec 2020','ICAI','250/400 (62.5%)','Cleared in First Attempt'],
 ['B.COM.','2022-2025','Ahmedabad University','500/800 (62.5%)','99/100 in Mathematics'],
 ['Class XII','Mar 2021','Devasya International School','500/800 (62.5%)','School Rank 1'],
 ['Class X','Mar 2019','SKR High School, Pune','500/800 (62.5%)','School Rank 1']],
 'Industrial_Training_CV_Template_1':[
 ['Year','Degree/ Examination','Board/ Institute','%/ CGPA','Remarks'],
 ['Nov 2023','CA Intermediate','ICAI','222/400','Exemption in FM-EFF'],
 ['May 2023','CA Intermediate','ICAI','200/400','-'],
 ['Dec 2020','CA Foundation','ICAI','265/400','Cleared in 1st Attempt'],
 ['2020-2023','B. Com (Hons.)','St. Xavier’s University, Kolkata','8.52 CGPA','First Division'],
 ['2020','Class XII, CBSE','Rotary Public School, Bargarh','96.5%','School Topper'],
 ['2018','Class X, CBSE','Rotary Public School, Bargarh','94.75%','Among the Top 5']],
 'Industrial_Training_CV_Template_2':[
 ['Qualification','Year','Institution/ Board','Percentage','Remarks'],
 ['CA Intermediate','NOV 2023','ICAI','56.12%','Exemption in 4 Subjects'],
 ['CA Foundation','DEC 2022','ICAI','62.75%','Exemption in 3 Subjects'],
 ['B. Com','2023- 2026','University Of Mysore','8 GPA','College Ranker'],
 ['Class 12th','2022','BIEAP','88%','School Rank 1'],
 ['Class 10th','2020','Andhra Pradesh State Board','10.0 CGPA','School Rank 1']]
}

def shade(p,color):
 pp=p._p.get_or_add_pPr();node=OxmlElement('w:shd');node.set(qn('w:fill'),color);pp.append(node)
def para(doc,text,bold=False,bullet=False,size=None):
 p=doc.add_paragraph();f=p.paragraph_format;f.space_after=Pt(2);f.line_spacing=1.04
 if bullet: f.left_indent=Pt(10);f.first_line_indent=Pt(-8)
 r=p.add_run(('• ' if bullet else '')+text);r.bold=bold
 if size:r.font.size=Pt(size)
 return p

def table(doc,rows):
 t=doc.add_table(rows=0,cols=len(rows[0]));t.style='Table Grid';t.autofit=False
 widths=[1.30,1.05,2.15,1.10,1.85] if len(rows[0])==5 else []
 for data in rows:
  cells=t.add_row().cells
  for i,(c,text) in enumerate(zip(cells,data)):
   if widths:c.width=Inches(widths[i])
   p=c.paragraphs[0];p.paragraph_format.space_after=Pt(1);p.paragraph_format.space_before=Pt(1);p.paragraph_format.line_spacing=1.0
   r=p.add_run(text);r.font.size=Pt(8.5);r.bold=data is rows[0]
   if data is rows[0]:shade(p,'E9EDF1')
 return t

def simple_paragraphs(doc,text):
 lines=text.strip().splitlines();pending='';bullet=False
 def flush():
  nonlocal pending
  if pending:para(doc,pending,bullet=bullet);pending=''
 for line in lines:
  line=line.strip()
  if re.match(r'^[•●▪]\s*',line):
   flush();bullet=True;pending=re.sub(r'^[•●▪]\s*','',line)
  elif '||' in line or re.match(r'^(Captain|Event Head|Article Trainee|Kantilal Patel|Goenka Mehta)',line):
   flush();bullet=False;para(doc,line,bold=True)
  elif line.startswith('(') and line.endswith(')'):
   flush();bullet=False;para(doc,line)
  elif line in ['Sports','Miscellaneous','IT Skills','Languages']:
   flush();bullet=False;para(doc,line,bold=True)
  elif line.startswith(('INSTITUTE OF','ONKARMAL SOMANI','SHREE SWAMI','T R CHADHA','Article Assistant')):
   flush();bullet=False;para(doc,line,bold=True)
  elif not bullet and re.search(r'\b(Foundation|Intermediate|Final) \||12th Standard|Bachelor of Commerce',line):
   flush();para(doc,line)
  elif not bullet and line.startswith('Currently seeking'):
   flush();pending=line
  else:pending+=(' ' if pending else '')+line
 flush()

def cover(doc,text):
 doc.styles['Normal'].font.name='Times New Roman';doc.styles['Normal'].font.size=Pt(11)
 s=doc.sections[0];s.top_margin=Inches(.6);s.bottom_margin=Inches(.6);s.left_margin=Inches(.7);s.right_margin=Inches(.7)
 lines=text.splitlines();p=doc.add_paragraph(lines[0],style='Title');p.paragraph_format.space_after=Pt(3);p.runs[0].font.size=Pt(20)
 for line in lines[1:6]:para(doc,line)
 doc.add_paragraph('')
 body='\n'.join(lines[6:]);starts=['Dear,','I am writing','During my tenure','I am particularly','I am confident','Thank you','Sincerely,']
 parts=re.split(r'\n(?=(?:'+ '|'.join(re.escape(x) for x in starts)+r'))',body)
 for part in parts:
  text=' '.join(part.splitlines())
  if text.startswith('Sincerely,'):
   for line in part.splitlines():para(doc,line)
  else:
   p=para(doc,text);p.paragraph_format.space_after=Pt(12);p.paragraph_format.line_spacing=1.10

def build(source):
 with pdfplumber.open(source) as pdf: text='\n'.join(p.extract_text() or '' for p in pdf.pages)
 doc=Document();s=doc.sections[0];s.page_width=Inches(8.27);s.page_height=Inches(11.69)
 for attr in ['left_margin','right_margin']:setattr(s,attr,Inches(.32))
 for attr in ['top_margin','bottom_margin']:setattr(s,attr,Inches(.3))
 normal=doc.styles['Normal'];normal.font.name='Arial';normal.font.size=Pt(9)
 normal.paragraph_format.space_after=Pt(2);normal.paragraph_format.line_spacing=1.02
 doc.styles['Title'].font.name='Arial';doc.styles['Title'].font.color.rgb=RGBColor(0,0,0)
 doc.core_properties.author='My Student Club';doc.core_properties.title=source.stem;doc.core_properties.subject='Editable career resource template'
 if 'cover' in source.stem.lower():cover(doc,text)
 else:
  headings=HEADINGS[source.stem]; firstpos=text.index('\n'+headings[0]);header=text[:firstpos].splitlines()
  p=doc.add_paragraph(header[0],style='Title');p.paragraph_format.space_after=Pt(3);p.runs[0].font.size=Pt(20)
  if source.stem!='CV Template-1':p.alignment=WD_ALIGN_PARAGRAPH.CENTER
  p=para(doc,' '.join(header[1:]),size=9);p.paragraph_format.space_after=Pt(7)
  if source.stem!='CV Template-1':p.alignment=WD_ALIGN_PARAGRAPH.CENTER
  if source.stem=='Industrial_Training_CV_Template_2':
   para(doc,'OBJECTIVE',bold=True)
   para(doc,'Highly motivated CA Article Trainee with a strong analytical mindset and a passion for delivering actionable insights. Seeking a CA Industrial Trainee role to enhance practical skills, drive financial efficiency and contribute to the operational success of the organization.')
  for i,h in enumerate(headings):
   start=text.index('\n'+h)+len(h)+1;end=text.index('\n'+headings[i+1]) if i+1<len(headings) else len(text)
   body=text[start:end].strip()
   p=para(doc,h,bold=True,size=10);p.paragraph_format.space_before=Pt(5);p.paragraph_format.space_after=Pt(4);p.paragraph_format.keep_with_next=True
   if source.stem!='CV Template-1':
    color='5087C7' if source.stem=='CV Template-2' else '18202A' if source.stem=='Industrial_Training_CV_Template_1' else 'E2E6EB'
    shade(p,color)
    if source.stem!='Industrial_Training_CV_Template_2':p.runs[0].font.color.rgb=RGBColor(255,255,255)
   if i==0 and source.stem in TABLES:table(doc,TABLES[source.stem]);continue
   if source.stem=='CV Template-2' and h=='POSITIONS OF LEADERSHIP':
    para(doc,'Founder, My Student Club',bold=True)
    para(doc,'Led 100+ drives involving more than 500+ people, assisting civil society, during the past 1.5 years of the pandemic.',bullet=True)
    para(doc,'Conducted Programs for creating awareness regarding Covid Vaccination.',bullet=True)
    para(doc,'National Case Competition',bold=True)
    para(doc,'Headed a team of 5 students in the National Case Competition, demonstrating exceptional leadership and strategic planning skills; our innovative approach and effective collaboration resulted in a top 10% ranking among 50 participating teams.',bullet=True)
   elif source.stem=='CV Template-2' and h=='ADDITIONAL SKILLS':
    para(doc,'Additional Skills: SAP, Tally Prime, MS Office')
    para(doc,'Languages: Fluent in English; Hindi, Telugu')
    para(doc,'Certifications & Training: MSC IT Certificate')
   elif source.stem=='Industrial_Training_CV_Template_1' and h=='COURSES & CERTIFICATIONS':
    para(doc,'Excel for Beginners, CA Monk: Learned the basics of MS Excel, including Power Query, V-lookup, Pivot Table, etc.')
    para(doc,'Financial Modeling, CA Monk: Developed a strong foundation in financial modeling, including building financial projections, and analyzing financial statements.')
    para(doc,'Power BI Course, SkillCourse: Developed proficiency in data visualization, dashboard creation, and deriving actionable insights using Power BI.')
    para(doc,'Finance Masterclass, CA Monk: Learned essential finance skills, including MIS Reporting, drafting financial statements, ratio analysis, and insights on Ind AS 115 & Ind AS 116.')
   elif source.stem=='CV Template-2' and h=='INTEREST AND HOBBIES':
    para(doc,'Kho-Kho: Captained school cricket team for 2 years and represented at state level.')
    para(doc,'Trekking: Kumar Parvatha Trek: Climbed Kumar Parvatha which is at altitude of 700 m. Skandgiri Trek: Climbed 2100 Feet in 1.5 hours.')
   elif source.stem=='Industrial_Training_CV_Template_2' and h=='TECHNICAL SKILLS: OTHER SKILLS:':
    for value in ['Proficient in MS-Excel, Word and PowerPoint','Financial Modelling and Valuations','Analytical and Problem-Solving','Ability to work under pressure and meet deadlines','Curiosity to Learn new things, Team Player and Active Listener','Strong Communication skills']:para(doc,value,bullet=True)
   elif source.stem=='Industrial_Training_CV_Template_2' and h=='ADDITIONAL INFORMATION:':
    sections=[('Certifications',['Financial Modeling and Valuation Analyst (FMVA® from CFI)','Capital Markets Securities Analyst (CMSA® from CFI)','JPMorgan Investment Banking (MsA targets, Financial Analysis, Investment Recommendation)']),('Personal Details',['Hobbies: Exploring new things, music and podcasts, cricket, and football.','Languages: English, Telugu and Hindi']),('Achievements',['Awarded Best Performance for consistently exceeding targets during articleship','Cleared CA Intermediate on the first attempt with three exemptions, achieving the highest score in our batch','Won Junior Head Boy elections and was the District Winner at the school level in Master Orator Competition','Led our school cricket team as captain, guiding the team to several key victories against over 15 other teams']),('Languages',['Hindi, English, Telugu'])]
    for label,bullets in sections:
     para(doc,label,bold=True)
     for value in bullets:para(doc,value,bullet=True)
   else:simple_paragraphs(doc,body)
 for root in [doc.element,doc.styles.element]:
  for border in root.xpath('.//w:pBdr'):
   border.getparent().remove(border)
 if source.stem=='Industrial_Training_CV_Template_2':
  for p in doc.paragraphs:
   p.paragraph_format.space_after=Pt(1)
   p.paragraph_format.line_spacing=1.0
 doc.save(source.with_suffix('.docx'))
 print(source.with_suffix('.docx'))
for folder in ['assets/ca-fresher-resources','assets/ca-industrial-resources']:
 for p in (ROOT/folder).glob('*.pdf'):
  if 'cv' in p.name.lower() or 'cover' in p.name.lower():build(p)
