# Rebuilding the PDF guide

`docs/AB-sandbox-guide.pdf` is generated from these scripts (charts with matplotlib, layout with reportlab).
The text lives in `make_pdf.py`; edit it and rebuild.

```bash
python3 -m venv /tmp/pdfenv && /tmp/pdfenv/bin/pip install -r docs/pdf/requirements.txt
mkdir -p /tmp/figs
/tmp/pdfenv/bin/python docs/pdf/make_figs.py /tmp/figs
/tmp/pdfenv/bin/python docs/pdf/make_pdf.py /tmp/figs docs/AB-sandbox-guide.pdf
```

`reportlab==4.2.5` is pinned because newer releases need Python 3.10+; on a newer Python the latest version works too.
