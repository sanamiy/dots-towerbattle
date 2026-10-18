import {z} from 'zod';
/** ChatGPT file input contract: keep all four fields in the advertised schema. */
export const characterFileSchema=z.object({
  name:z.string().trim().min(1).max(24),
  file:z.object({
    download_url:z.string().min(1).max(8000),
    file_id:z.string().min(1).max(256),
    mime_type:z.string().max(100).optional(),
    file_name:z.string().max(256).optional(),
  }).strict(),
  layout:z.enum(['single','sheet_4x4']),
  command_id:z.string().min(8).max(120),
}).strict();
export const CHARACTER_FILE_DESCRIPTION='本人のdotが、共有済みの参照画像または生成済みの透明PNGをゲームへ直接登録します。ChatGPTの実ファイルをfileへ渡し、file_idや一時URLを推測・捏造しないでください。singleは最初の1枚、sheet_4x4は16ポーズ。参照元のない別キャラクター画像で本人の外見を代用しません。最大2048px・8MB。single登録の直後に、ゲーム開始を待たず16ポーズの背景生成を必ず起動してください。生成起動後は完成を待たず参加・準備でき、後からsheet_4x4を登録すると次の手番から採用されます。既存の駒や操作中の駒は変わりません。再試行は同じcommand_idと同じファイルで行います。';
