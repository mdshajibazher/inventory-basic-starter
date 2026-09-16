from pathlib import Path
import re
from xml.sax.saxutils import escape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Preformatted, PageBreak, Table, TableStyle, Spacer
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
base=Path('output/pdf/inventory-ubuntu-24-04-deployment-guide')
for name,f in [('Body','DejaVuSans.ttf'),('Bold','DejaVuSans-Bold.ttf'),('Mono','DejaVuSansMono.ttf')]:
 pdfmetrics.registerFont(TTFont(name,'/usr/share/fonts/truetype/dejavu/'+f))
pdfmetrics.registerFontFamily('Body',normal='Body',bold='Bold',italic='Body',boldItalic='Bold')
styles={
 'p':ParagraphStyle('p',fontName='Body',fontSize=9,leading=12.7,spaceAfter=8,textColor=colors.HexColor('#233448')),
 'h1':ParagraphStyle('h1',fontName='Bold',fontSize=20,leading=25,spaceAfter=13,textColor=colors.HexColor('#12334d')),
 'h2':ParagraphStyle('h2',fontName='Bold',fontSize=12,leading=16,spaceBefore=7,spaceAfter=8,keepWithNext=True,textColor=colors.HexColor('#126778')),
 'code':ParagraphStyle('code',fontName='Mono',fontSize=7.8,leading=10.1,spaceBefore=3,spaceAfter=11),
 'cell':ParagraphStyle('cell',fontName='Body',fontSize=8,leading=11,spaceAfter=1),
}
def fmt(t):
 t=escape(t)
 t=re.sub(r'\*\*(.*?)\*\*',r'<b>\1</b>',t)
 return re.sub(r'\[([^\]]+)\]\((https?://[^)]+)\)',r'<link href="\2" color="#126778"><u>\1</u></link>',t)
story=[]
lines=base.with_suffix('.md').read_text().splitlines();i=0
while i<len(lines):
 line=lines[i]
 if not line.strip(): i+=1;continue
 if line=='---PAGE---': story.append(PageBreak());i+=1;continue
 if line.startswith('```'):
  i+=1;block=[]
  while i<len(lines) and not lines[i].startswith('```'): block.append(lines[i]);i+=1
  text='\n'.join(block)
  wide=max(pdfmetrics.stringWidth(x,'Mono',7.8) for x in block)
  style=ParagraphStyle('block',parent=styles['code'],fontSize=min(7.8,7.8*480/max(wide,1)))
  story.append(Preformatted(text,style));i+=1;continue
 if line.startswith('|'):
  rows=[]
  while i<len(lines) and lines[i].startswith('|'):
   row=[x.strip() for x in lines[i].strip('|').split('|')]
   if not all(re.fullmatch(r'[-: ]+',x) for x in row): rows.append(row)
   i+=1
  data=[[Paragraph(('<b>'+fmt(c)+'</b>') if r==0 else fmt(c),styles['cell']) for c in row] for r,row in enumerate(rows)]
  table=Table(data,colWidths=[115,188,188],hAlign='LEFT')
  table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e7eff3')),('VALIGN',(0,0),(-1,-1),'TOP'),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),('LINEBELOW',(0,0),(-1,-1),.3,colors.HexColor('#dae3e9'))]))
  story.extend([table,Spacer(1,10)]);continue
 if line.startswith('# '): story.append(Paragraph(fmt(line[2:]),styles['h1']))
 elif line.startswith('## '): story.append(Paragraph(fmt(line[3:]),styles['h2']))
 else: story.append(Paragraph(fmt(line),styles['p']))
 i+=1

def footer(c,doc):
 w,h=A4;c.setStrokeColor(colors.HexColor('#d7e0e7'));c.line(50,41,w-50,41)
 c.setFont('Body',7);c.setFillColor(colors.HexColor('#526176'))
 c.drawString(50,28,'INVENTORY / ONE VPS / IP ACCESS NOW, DOMAINS LATER')
 c.drawRightString(w-50,28,str(doc.page))
 c.setTitle('Inventory Deployment - Ubuntu 24.04, Multiple Projects, Domains Later')
 c.setAuthor('Inventory project deployment guide')
SimpleDocTemplate(str(base.with_suffix('.pdf')),pagesize=A4,leftMargin=50,rightMargin=50,topMargin=38,bottomMargin=55).build(story,onFirstPage=footer,onLaterPages=footer)
print(base.with_suffix('.pdf').resolve())
