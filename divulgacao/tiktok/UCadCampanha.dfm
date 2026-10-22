object FrmCadCampanha: TFrmCadCampanha
  Left = 0
  Top = 0
  BorderIcons = [biSystemMenu, biMaximize]
  Caption = 'Cadastro de campanhas'
  ClientHeight = 661
  ClientWidth = 1011
  Color = clBtnFace
  Font.Charset = DEFAULT_CHARSET
  Font.Color = clWindowText
  Font.Height = -11
  Font.Name = 'Tahoma'
  Font.Style = []
  OldCreateOrder = False
  WindowState = wsMaximized
  OnClose = FormClose
  OnKeyDown = FormKeyDown
  OnKeyPress = FormKeyPress
  OnShow = FormShow
  PixelsPerInch = 96
  TextHeight = 13
  object cxGCampanha: TcxGrid
    Left = 0
    Top = 317
    Width = 1011
    Height = 344
    Align = alClient
    BorderStyle = cxcbsNone
    PopupMenu = PopOpcoes
    TabOrder = 0
    LockedStateImageOptions.Text = 'Por favor aguarde...'
    LookAndFeel.Kind = lfFlat
    LookAndFeel.NativeStyle = False
    LookAndFeel.ScrollbarMode = sbmClassic
    LookAndFeel.SkinName = 'DevExpressStyle'
    object cxGridPerformaceTableView1: TcxGridDBTableView
      Navigator.Buttons.CustomButtons = <>
      Navigator.Buttons.First.Visible = True
      Navigator.Buttons.PriorPage.Visible = False
      Navigator.Buttons.Prior.Visible = True
      Navigator.Buttons.Next.Visible = True
      Navigator.Buttons.NextPage.Visible = False
      Navigator.Buttons.Last.Visible = True
      Navigator.Buttons.Insert.Visible = False
      Navigator.Buttons.Append.Visible = False
      Navigator.Buttons.Delete.Visible = False
      Navigator.Buttons.Edit.Visible = False
      Navigator.Buttons.Post.Visible = False
      Navigator.Buttons.Cancel.Enabled = False
      Navigator.Buttons.Cancel.Visible = False
      Navigator.Buttons.Refresh.Visible = False
      Navigator.Buttons.SaveBookmark.Visible = False
      Navigator.Buttons.GotoBookmark.Visible = False
      Navigator.Buttons.Filter.Visible = True
      Navigator.InfoPanel.DisplayMask = '[RecordIndex] de [RecordCount]'
      Navigator.Visible = True
      FindPanel.InfoText = 'Digite um texto para pesquisar...'
      DataController.DataSource = DsCampanha
      DataController.DetailKeyFieldNames = 'None selected'
      DataController.Filter.AutoDataSetFilter = True
      DataController.KeyFieldNames = 'id'
      DataController.Summary.DefaultGroupSummaryItems = <
        item
          Format = 'Reg: #'
          Kind = skCount
          FieldName = 'CALC_STATUS'
          DisplayText = 'Reg:'
        end
        item
          Format = 'Tickt m'#233'dio: #,##0.00'
          Kind = skAverage
          FieldName = 'TOTAL_VEN'
          DisplayText = 'Tickt m'#233'dio'
        end
        item
          Format = 'Devolvido: #,##0.00'
          Kind = skAverage
          FieldName = 'TOTAL_DEV'
          DisplayText = 'Total Devolvido'
        end
        item
          Format = 'Total geral: #,##0.00'
          Kind = skSum
          FieldName = 'CALC_TOTAL_LIQ'
          DisplayText = 'Total geral:'
        end>
      DataController.Summary.FooterSummaryItems = <
        item
          Format = 'Reg: #'
          Kind = skCount
          FieldName = 'NOME_PRO'
          DisplayText = 'Reg:'
        end
        item
          Format = 'Tickt m'#233'dio: #,##0.00'
          Kind = skAverage
          FieldName = 'TOTAL_VEN'
          DisplayText = 'Tickt m'#233'dio'
        end
        item
          Format = 'Devolvido: #,##0.00'
          Kind = skAverage
          FieldName = 'TOTAL_DEV'
          DisplayText = 'Devolvido:'
        end
        item
          Format = 'Total geral: #,##0.00'
          Kind = skSum
          FieldName = 'CALC_TOTAL_LIQ'
          DisplayText = 'Total geral:'
        end>
      DataController.Summary.SummaryGroups = <>
      FilterRow.InfoText = 'Clique aqui para definir um filtro'
      FilterRow.Visible = True
      NewItemRow.InfoText = 'Clique aqui para adicionar uma nova linha'
      OptionsBehavior.GoToNextCellOnEnter = True
      OptionsBehavior.IncSearch = True
      OptionsCustomize.ColumnsQuickCustomization = True
      OptionsData.Deleting = False
      OptionsData.Editing = False
      OptionsData.Inserting = False
      OptionsView.NoDataToDisplayInfoText = '<Nenhum registro para exibir>'
      OptionsView.Footer = True
      OptionsView.FooterAutoHeight = True
      OptionsView.GroupFooters = gfVisibleWhenExpanded
      OptionsView.GroupRowStyle = grsOffice11
      OptionsView.HeaderFilterButtonShowMode = fbmSmartTag
      OptionsView.Indicator = True
      OptionsView.ShowColumnFilterButtons = sfbWhenSelected
      object cxGridPerformaceTableView1id: TcxGridDBColumn
        DataBinding.FieldName = 'id'
      end
      object cxGridPerformaceTableView1data_inicial: TcxGridDBColumn
        DataBinding.FieldName = 'data_inicial'
      end
      object cxGridPerformaceTableView1data_final: TcxGridDBColumn
        DataBinding.FieldName = 'data_final'
      end
      object cxGridPerformaceTableView1titulo: TcxGridDBColumn
        DataBinding.FieldName = 'titulo'
        Width = 448
      end
      object cxGridPerformaceTableView1descricao: TcxGridDBColumn
        DataBinding.FieldName = 'descricao'
      end
      object cxGridPerformaceTableView1ativa: TcxGridDBColumn
        DataBinding.FieldName = 'ativa'
        Width = 53
      end
      object cxGridPerformaceTableView1nome_arquivo: TcxGridDBColumn
        DataBinding.FieldName = 'nome_arquivo'
      end
      object cxGridPerformaceTableView1tipo_acao: TcxGridDBColumn
        DataBinding.FieldName = 'tipo_acao'
      end
      object cxGridPerformaceTableView1acao: TcxGridDBColumn
        DataBinding.FieldName = 'acao'
      end
      object cxGridPerformaceTableView1texto_botao_acao: TcxGridDBColumn
        DataBinding.FieldName = 'texto_botao_acao'
      end
    end
    object cxGridLevel4: TcxGridLevel
      GridView = cxGridPerformaceTableView1
    end
  end
  object Panel1: TPanel
    Left = 0
    Top = 0
    Width = 1011
    Height = 317
    Align = alTop
    TabOrder = 1
    object gbBuscaEntreDadas: TGroupBox
      Left = 46
      Top = 8
      Width = 410
      Height = 52
      Caption = 'Data da campanha'
      TabOrder = 0
      object Label1: TLabel
        Left = 3
        Top = 26
        Width = 65
        Height = 16
        Caption = 'Data Inicio:'
        Font.Charset = ANSI_CHARSET
        Font.Color = clWindowText
        Font.Height = -13
        Font.Name = 'Arial'
        Font.Style = []
        ParentFont = False
      end
      object Label7: TLabel
        Left = 218
        Top = 26
        Width = 63
        Height = 16
        Caption = 'Data Final:'
        Font.Charset = ANSI_CHARSET
        Font.Color = clWindowText
        Font.Height = -13
        Font.Name = 'Arial'
        Font.Style = []
        ParentFont = False
      end
      object edtDataini: TDateTimePicker
        Left = 69
        Top = 21
        Width = 105
        Height = 21
        Date = 43657.000000000000000000
        Time = 0.479379930562572600
        TabOrder = 0
      end
      object edtDatafin: TDateTimePicker
        Left = 287
        Top = 21
        Width = 105
        Height = 21
        Date = 43657.000000000000000000
        Time = 0.479379930562572600
        TabOrder = 1
      end
    end
    object DBRTecnico: TDBRadioGroup
      Left = 462
      Top = 8
      Width = 99
      Height = 50
      Caption = 'Campanha ativa'
      TabOrder = 1
    end
    object DBRadioGroup4: TDBRadioGroup
      Left = 567
      Top = 8
      Width = 82
      Height = 50
      Caption = 'Tipo de a'#231#227'o'
      TabOrder = 2
    end
    object edtId: TAlignEdit
      Left = 8
      Top = 35
      Width = 32
      Height = 23
      TabStop = False
      CharCase = ecUpperCase
      Color = clYellow
      Font.Charset = ANSI_CHARSET
      Font.Color = clWindowText
      Font.Height = -12
      Font.Name = 'Arial'
      Font.Style = []
      ParentFont = False
      TabOrder = 3
    end
    object cbAtivo: TComboBox
      Left = 469
      Top = 29
      Width = 82
      Height = 24
      Style = csDropDownList
      Color = 8454143
      Font.Charset = ANSI_CHARSET
      Font.Color = clWindowText
      Font.Height = -12
      Font.Name = 'Arial Narrow'
      Font.Style = [fsBold]
      ParentFont = False
      TabOrder = 4
      Items.Strings = (
        'SIM'
        'N'#195'O')
    end
    object CbTipoAcao: TComboBox
      Left = 567
      Top = 29
      Width = 80
      Height = 24
      Style = csDropDownList
      Color = 8454143
      Font.Charset = ANSI_CHARSET
      Font.Color = clWindowText
      Font.Height = -12
      Font.Name = 'Arial Narrow'
      Font.Style = [fsBold]
      ParentFont = False
      TabOrder = 5
      Items.Strings = (
        'SEM A'#199#195'O'
        'CLICK NO BOT'#195'O'
        'V'#205'DEO (CLIQUE NO BOT'#195'O)')
    end
    object DBRadioGroup2: TDBRadioGroup
      Left = 8
      Top = 64
      Width = 641
      Height = 45
      Caption = 'Titulo da campanha'
      TabOrder = 6
    end
    object EdtTitulo: TAlignEdit
      Left = 18
      Top = 86
      Width = 626
      Height = 23
      CharCase = ecUpperCase
      Color = clWhite
      Font.Charset = ANSI_CHARSET
      Font.Color = clWindowText
      Font.Height = -12
      Font.Name = 'Arial'
      Font.Style = []
      MaxLength = 100
      ParentFont = False
      TabOrder = 7
    end
    object DBRadioGroup1: TDBRadioGroup
      Left = 8
      Top = 115
      Width = 641
      Height = 45
      Caption = 'Descri'#231#227'o da campanha'
      TabOrder = 8
    end
    object EdtDescricao: TAlignEdit
      Left = 18
      Top = 128
      Width = 626
      Height = 23
      CharCase = ecUpperCase
      Color = clWhite
      Font.Charset = ANSI_CHARSET
      Font.Color = clWindowText
      Font.Height = -12
      Font.Name = 'Arial'
      Font.Style = []
      MaxLength = 100
      ParentFont = False
      TabOrder = 9
    end
    object DBRadioGroup6: TDBRadioGroup
      Left = 8
      Top = 166
      Width = 769
      Height = 45
      Caption = 'Link da imagem da campanha'
      TabOrder = 10
    end
    object edtNome_arquivo: TAlignEdit
      Left = 18
      Top = 185
      Width = 626
      Height = 23
      Color = clWhite
      Font.Charset = ANSI_CHARSET
      Font.Color = clWindowText
      Font.Height = -12
      Font.Name = 'Arial'
      Font.Style = []
      MaxLength = 100
      ParentFont = False
      TabOrder = 11
    end
    object DBRadioGroup5: TDBRadioGroup
      Left = 8
      Top = 217
      Width = 641
      Height = 45
      Caption = 'Descri'#231#227'o do bot'#227'o de a'#231#227'o'
      TabOrder = 12
    end
    object EdtTextoAcao: TAlignEdit
      Left = 18
      Top = 235
      Width = 626
      Height = 23
      Color = clWhite
      Font.Charset = ANSI_CHARSET
      Font.Color = clWindowText
      Font.Height = -12
      Font.Name = 'Arial'
      Font.Style = []
      MaxLength = 100
      ParentFont = False
      TabOrder = 13
    end
    object DBRadioGroup3: TDBRadioGroup
      Left = 8
      Top = 268
      Width = 641
      Height = 45
      Caption = 'Link da pagina ou do video que o usu'#225'rio ir'#225' clicar'
      TabOrder = 14
    end
    object EdtAcao: TAlignEdit
      Left = 18
      Top = 287
      Width = 629
      Height = 23
      Color = clWhite
      Font.Charset = ANSI_CHARSET
      Font.Color = clWindowText
      Font.Height = -12
      Font.Name = 'Arial'
      Font.Style = []
      MaxLength = 100
      ParentFont = False
      TabOrder = 15
    end
    object btnResetar: TBitBtn
      Left = 677
      Top = 268
      Width = 184
      Height = 35
      Caption = 'Salvar'
      TabOrder = 16
      OnClick = btnResetarClick
    end
    object BitBtn2: TBitBtn
      Left = 881
      Top = 269
      Width = 94
      Height = 33
      Caption = '&Sair'
      TabOrder = 17
      OnClick = BitBtn2Click
    end
    object BtnUploadImagem: TButton
      Left = 650
      Top = 184
      Width = 113
      Height = 25
      Caption = 'Selecionar imagem'
      TabOrder = 18
      OnClick = BtnUploadImagemClick
    end
  end
  object QCampanha: TFDQuery
    Connection = Dm.FDConexao
    SQL.Strings = (
      'SELECT * FROM campanha_mensagem cp '
      'ORDER BY cp.id  desc')
    Left = 938
    Top = 382
    object QCampanhaid: TFDAutoIncField
      FieldName = 'id'
      Origin = 'id'
      ProviderFlags = [pfInWhere, pfInKey]
      ReadOnly = True
    end
    object QCampanhaativa: TStringField
      FieldName = 'ativa'
      Origin = 'ativa'
      Required = True
      FixedChar = True
      Size = 1
    end
    object QCampanhatitulo: TStringField
      FieldName = 'titulo'
      Origin = 'titulo'
      Required = True
      Size = 100
    end
    object QCampanhadescricao: TStringField
      FieldName = 'descricao'
      Origin = 'descricao'
      Required = True
      Size = 100
    end
    object QCampanhadata_inicial: TDateField
      FieldName = 'data_inicial'
      Origin = 'data_inicial'
      Required = True
    end
    object QCampanhadata_final: TDateField
      FieldName = 'data_final'
      Origin = 'data_final'
      Required = True
    end
    object QCampanhanome_arquivo: TStringField
      FieldName = 'nome_arquivo'
      Origin = 'nome_arquivo'
      Required = True
      Size = 100
    end
    object QCampanhatipo_acao: TIntegerField
      FieldName = 'tipo_acao'
      Origin = 'tipo_acao'
      Required = True
    end
    object QCampanhaacao: TStringField
      FieldName = 'acao'
      Origin = 'acao'
      Required = True
      Size = 100
    end
    object QCampanhatexto_botao_acao: TStringField
      AutoGenerateValue = arDefault
      FieldName = 'texto_botao_acao'
      Origin = 'texto_botao_acao'
      Size = 100
    end
  end
  object DsCampanha: TDataSource
    DataSet = QCampanha
    Left = 878
    Top = 385
  end
  object PopOpcoes: TPopupMenu
    Left = 906
    Top = 436
    object A1: TMenuItem
      Caption = 'Adicionar clientes na campanha'
      OnClick = A1Click
    end
    object mAlterarProcedimento: TMenuItem
      Caption = 'Alterar campanha'
      OnClick = mAlterarProcedimentoClick
    end
    object C1: TMenuItem
      Caption = 'Excluir campanha'
      OnClick = C1Click
    end
  end
  object OpenPictureDialog: TOpenPictureDialog
    Filter = 
      'All (*.png;*.gif;*.png;*.jpg;*.jpeg;*.bmp)|*.png;*.gif;*.png;*.j' +
      'pg;*.jpeg;*.bmp|Portable Network Graphics (*.png)|*.png|JPEG Ima' +
      'ge File (*.jpg)|*.jpg|JPEG Image File (*.jpeg)|*.jpeg|Bitmaps (*' +
      '.bmp)|*.bmp'
    Title = 'Selecione uma imagem'
    Left = 720
    Top = 96
  end
end
