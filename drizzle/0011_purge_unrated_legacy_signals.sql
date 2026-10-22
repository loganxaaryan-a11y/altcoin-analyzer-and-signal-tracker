DELETE FROM `generated_signals`
WHERE `source_as_of` IS NULL
   OR `factors_json` IS NULL
   OR trim(`factors_json`) = ''
   OR trim(`factors_json`) = '[]';
