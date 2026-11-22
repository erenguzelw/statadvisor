# Referans doğrulama

`generate.py`, SciPy / statsmodels / scikit-learn / pingouin ile tohumlu rastgele vakalar üretir ve sonuçlarını
`packages/shared/fixtures/reference.json` dosyasına yazar. `packages/shared/src/reference.test.ts` bu dosyayı
okuyup TypeScript uygulamasının sonuçlarını referansla karşılaştırır (en büyük sapma ölçülmüş: makine hassasiyeti).

## Referansları yenilemek

```bash
py -m venv tools/reference/.venv
tools/reference/.venv/Scripts/python.exe -m pip install -r tools/reference/requirements.txt
tools/reference/.venv/Scripts/python.exe tools/reference/generate.py
```

Üretilen JSON depoya eklenir; sıradan test çalıştırmak için Python gerekmez.
