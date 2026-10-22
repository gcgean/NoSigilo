unit UCadCampanha;

interface

uses
  Winapi.Windows, Winapi.Messages, System.SysUtils, System.Variants, System.Classes, Vcl.Graphics,
  Vcl.Controls, Vcl.Forms, Vcl.Dialogs, Vcl.StdCtrls, Vcl.ExtCtrls, Vcl.DBCtrls, Rest.Types,
  AlignEdit, Vcl.ComCtrls, cxGraphics, cxControls, cxLookAndFeels,
  cxLookAndFeelPainters, cxStyles, cxCustomData, cxFilter, cxData,
  cxDataStorage, cxEdit, cxNavigator, dxDateRanges,
  cxDataControllerConditionalFormattingRulesManagerDialog, Data.DB, cxDBData,
  cxGridLevel, cxGridCustomTableView, cxGridTableView, cxGridDBTableView,
  cxClasses, cxGridCustomView, cxGrid, Vcl.Buttons, FireDAC.Stan.Intf,
  FireDAC.Stan.Option, FireDAC.Stan.Param, FireDAC.Stan.Error, FireDAC.DatS,
  FireDAC.Phys.Intf, FireDAC.DApt.Intf, FireDAC.Stan.Async, FireDAC.DApt,
  FireDAC.Comp.DataSet, FireDAC.Comp.Client, Vcl.Menus, Vcl.ExtDlgs;

type
  TFrmCadCampanha = class(TForm)
    cxGCampanha: TcxGrid;
    cxGridPerformaceTableView1: TcxGridDBTableView;
    cxGridPerformaceTableView1id: TcxGridDBColumn;
    cxGridPerformaceTableView1ativa: TcxGridDBColumn;
    cxGridPerformaceTableView1titulo: TcxGridDBColumn;
    cxGridPerformaceTableView1descricao: TcxGridDBColumn;
    cxGridPerformaceTableView1data_inicial: TcxGridDBColumn;
    cxGridPerformaceTableView1data_final: TcxGridDBColumn;
    cxGridPerformaceTableView1nome_arquivo: TcxGridDBColumn;
    cxGridPerformaceTableView1tipo_acao: TcxGridDBColumn;
    cxGridPerformaceTableView1acao: TcxGridDBColumn;
    cxGridPerformaceTableView1texto_botao_acao: TcxGridDBColumn;
    cxGridLevel4: TcxGridLevel;
    Panel1: TPanel;
    gbBuscaEntreDadas: TGroupBox;
    Label1: TLabel;
    Label7: TLabel;
    edtDataini: TDateTimePicker;
    edtDatafin: TDateTimePicker;
    DBRTecnico: TDBRadioGroup;
    DBRadioGroup4: TDBRadioGroup;
    edtId: TAlignEdit;
    cbAtivo: TComboBox;
    CbTipoAcao: TComboBox;
    DBRadioGroup2: TDBRadioGroup;
    EdtTitulo: TAlignEdit;
    DBRadioGroup1: TDBRadioGroup;
    EdtDescricao: TAlignEdit;
    DBRadioGroup6: TDBRadioGroup;
    edtNome_arquivo: TAlignEdit;
    DBRadioGroup5: TDBRadioGroup;
    EdtTextoAcao: TAlignEdit;
    DBRadioGroup3: TDBRadioGroup;
    EdtAcao: TAlignEdit;
    btnResetar: TBitBtn;
    BitBtn2: TBitBtn;
    QCampanha: TFDQuery;
    DsCampanha: TDataSource;
    QCampanhaid: TFDAutoIncField;
    QCampanhaativa: TStringField;
    QCampanhatitulo: TStringField;
    QCampanhadescricao: TStringField;
    QCampanhadata_inicial: TDateField;
    QCampanhadata_final: TDateField;
    QCampanhanome_arquivo: TStringField;
    QCampanhatipo_acao: TIntegerField;
    QCampanhaacao: TStringField;
    QCampanhatexto_botao_acao: TStringField;
    PopOpcoes: TPopupMenu;
    mAlterarProcedimento: TMenuItem;
    C1: TMenuItem;
    A1: TMenuItem;
    BtnUploadImagem: TButton;
    OpenPictureDialog: TOpenPictureDialog;
    procedure FormClose(Sender: TObject; var Action: TCloseAction);
    procedure FormKeyDown(Sender: TObject; var Key: Word; Shift: TShiftState);
    procedure FormKeyPress(Sender: TObject; var Key: Char);
    procedure FormShow(Sender: TObject);
    procedure BuscaCampanhas;
    procedure btnResetarClick(Sender: TObject);
    procedure C1Click(Sender: TObject);
    procedure mAlterarProcedimentoClick(Sender: TObject);
    procedure BitBtn2Click(Sender: TObject);
    procedure Limpacampos;
    procedure A1Click(Sender: TObject);
    procedure BtnUploadImagemClick(Sender: TObject);
  private
    { Private declarations }
  public
    { Public declarations }
  end;

var
  FrmCadCampanha: TFrmCadCampanha;

implementation

uses
  Udm, UClientesCampanha, RestRequest4D, Zenith.Jsons;

{$R *.dfm}

procedure TFrmCadCampanha.A1Click(Sender: TObject);
begin

  Application.CreateForm(TFrmClientesCampanha, FrmClientesCampanha);
  FrmClientesCampanha.tag := 0;
  FrmClientesCampanha.Showmodal;
end;

procedure TFrmCadCampanha.BitBtn2Click(Sender: TObject);
begin
  close;
end;

procedure TFrmCadCampanha.btnResetarClick(Sender: TObject);
begin
  if cbAtivo.itemindex < 0 then
  begin
    showmessage('Informe se a campanha está ativa ou nao!');
    cbAtivo.setfocus;
    exit;
  end;

  if CbTipoAcao.itemindex < 0 then
  begin
    showmessage('Informe se a campanha está ativa ou nao!');
    CbTipoAcao.setfocus;
    exit;
  end;

  if Trim(EdtTitulo.Text) = EmptyStr then
  begin
    showmessage('informe o titulo!');
    EdtTitulo.setfocus;
    exit;
  end;

  if Trim(EdtDescricao.Text) = EmptyStr then
  begin
    showmessage('informe a descricão!');
    EdtTitulo.setfocus;
    exit;
  end;

  if Trim(edtNome_arquivo.Text) = EmptyStr then
  begin
    showmessage('informe o nome do arquivo!');
    edtNome_arquivo.setfocus;
    exit;
  end;

  if Trim(EdtTitulo.Text) = EmptyStr then
  begin
    showmessage('informe o nome fantasia!');
    EdtTitulo.setfocus;
    exit;
  end;

  if Trim(EdtTextoAcao.Text) = EmptyStr then
  begin
    showmessage('informe o texto da ação');
    EdtTextoAcao.setfocus;
    exit;
  end;

  if Trim(EdtAcao.Text) = EmptyStr then
  begin
    showmessage('informe a ação');
    EdtAcao.setfocus;
    exit;
  end;

  with dm.FDQInsert do
  begin
    close;
    SQL.Clear;

    if edtId.Text = '' then
      SQL.Text := 'INSERT INTO campanha_mensagem (ativa, titulo, descricao, data_inicial, ' +
        'data_final, nome_arquivo, tipo_acao, acao, texto_botao_acao) VALUES ' +
        '(:ativa, :titulo, :descricao, :data_inicial, :data_final, :nome_arquivo, ' +
        ':tipo_acao, :acao, :texto_botao_acao)'
    else
    begin
      SQL.Text := 'UPDATE campanha_mensagem SET ativa = :ativa, ' +
        'titulo = :titulo, descricao = :descricao, data_inicial = :data_inicial, ' +
        'data_final = :data_final, nome_arquivo = :nome_arquivo, ' +
        'tipo_acao = :tipo_acao, acao = :acao, texto_botao_acao = :texto_botao_acao ' +
        ' WHERE id = :id';
      ParamByName('id').AsInteger := strtoint(edtId.Text);
    end;

    if cbAtivo.itemindex = 0 then
      ParamByName('ativa').AsString := 'S'
    else
      ParamByName('ativa').AsString := 'N';

    ParamByName('titulo').AsString := Trim(EdtTitulo.Text);
    ParamByName('descricao').AsString := Trim(EdtDescricao.Text);
    ParamByName('data_inicial').asdatetime := edtDataini.date;
    ParamByName('data_final').asdatetime := edtDatafin.date;
    ParamByName('nome_arquivo').AsString := Trim(edtNome_arquivo.Text);

    if CbTipoAcao.itemindex = 0 then
      ParamByName('tipo_acao').AsString := '0'
    else if CbTipoAcao.itemindex = 1 then
      ParamByName('tipo_acao').AsString := '1'
    else
      ParamByName('tipo_acao').AsString := '2';

    ParamByName('acao').AsString := Trim(EdtAcao.Text);
    ParamByName('texto_botao_acao').AsString := Trim(EdtTextoAcao.Text);

    ExecSQL;
  end;
  Limpacampos;
  BuscaCampanhas;
end;

procedure TFrmCadCampanha.BtnUploadImagemClick(Sender: TObject);
var
  LResponse: IResponse;
  LStream: TMemoryStream;
  LFileName: String;
  LJson: TJsonZ;
begin
  if not OpenPictureDialog.Execute then
    exit;

  try
    LResponse := dm.ExecutarRequestAPICommand( //
      TRequest.New //
      .BaseURL('/files/stream') //
      .ContentType('application/octet-stream') //
      .AddHeader('X-Filename', '/CommandAnalytics/Campanhas/' +
      ExtractFileName(OpenPictureDialog.FileName), [poDoNotEncode]) //
      .AddBody(TFileStream.Create(OpenPictureDialog.FileName, fmOpenRead or fmShareDenyWrite)
      ), rmPOST);

    if not LResponse.Content.Trim.IsEmpty then
    begin
      LJson := TJsonZ.Create;

      try
        LJson.Parse(LResponse.Content.Trim);
        edtNome_arquivo.Text := LJson['caminho'].AsString.Trim;
      finally
        FreeAndNil(LJson);
      end;
    end
    else
      showmessage('Falha ao efetuar o upload da imagem!');
  except
    on E: Exception do
      showmessage('Falha ao efetuar o upload da imagem: ' + E.Message);
  end;
end;

procedure TFrmCadCampanha.BuscaCampanhas;
begin
  with QCampanha do
  begin
    close;
    SQL.Clear;
    SQL.add('  SELECT * FROM campanha_mensagem cp  ORDER BY cp.id  desc ');
    open;

  end;
end;

procedure TFrmCadCampanha.C1Click(Sender: TObject);
begin
  with dm.FDQInsert do
  begin
    close;
    SQL.Clear;
    SQL.add(' DELETE  FROM campanha_mensagem  ' + ' WHERE id = :id ');
    ParamByName('id').AsInteger := QCampanhaid.AsInteger;
    ExecSQL;
  end;
  BuscaCampanhas;
end;

procedure TFrmCadCampanha.FormClose(Sender: TObject; var Action: TCloseAction);
begin
  FrmCadCampanha := nil;
  Action := caFree;
end;

procedure TFrmCadCampanha.FormKeyDown(Sender: TObject; var Key: Word; Shift: TShiftState);
begin
  if Key = vk_escape then
  begin

    close;

  end;

end;

procedure TFrmCadCampanha.FormKeyPress(Sender: TObject; var Key: Char);
begin
  if Key = #13 then
  begin

    Key := #0;
    SelectNext(ActiveControl, true, true);

  end;
end;

procedure TFrmCadCampanha.FormShow(Sender: TObject);
begin
  edtDataini.date := (date);
  edtDatafin.date := date;
  BuscaCampanhas;
end;

procedure TFrmCadCampanha.Limpacampos;
begin
  edtId.Clear;
  EdtTitulo.Clear;
  EdtDescricao.Clear;
  edtNome_arquivo.Clear;
  EdtTextoAcao.Clear;
  EdtAcao.Clear;
end;

procedure TFrmCadCampanha.mAlterarProcedimentoClick(Sender: TObject);

begin
  if QCampanha.RecordCount <> 0 then
  begin
    edtId.Text := QCampanhaid.AsString;
    edtDataini.date := QCampanhadata_inicial.asdatetime;
    edtDatafin.date := QCampanhadata_final.asdatetime;

    EdtTitulo.Text := QCampanhatitulo.AsString;
    EdtDescricao.Text := QCampanhadescricao.AsString;
    edtNome_arquivo.Text := QCampanhanome_arquivo.AsString;
    EdtTextoAcao.Text := QCampanhatexto_botao_acao.AsString;
    EdtAcao.Text := QCampanhaacao.AsString;

    if QCampanhaativa.AsString = 'S' then
      cbAtivo.itemindex := 0
    else
      cbAtivo.itemindex := 1;

    CbTipoAcao.itemindex := QCampanhatipo_acao.AsInteger;

    edtDataini.setfocus;
  end;

end;

end.
