import {Component, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {FormBuilder} from '@angular/forms';
import {TableConfig} from '../../../components/data-view/data-table/table-config';
import {CrudService} from '../../../services/crud.service';
import {ResultSet} from '../../../components/data-view/models/result-set.model';
import {SqlHistory} from './sql-history.model';
import {KeyValue} from '@angular/common';
import {QueryRequest} from '../../../models/ui-request.model';
import {SidebarNode} from '../../../models/sidebar-node.model';
import {LeftSidebarService} from '../../../components/left-sidebar/left-sidebar.service';
import {InformationObject, InformationPage} from '../../../models/information-page.model';
import {BreadcrumbService} from '../../../components/breadcrumb/breadcrumb.service';
import {BreadcrumbItem} from '../../../components/breadcrumb/breadcrumb-item';
import {WebuiSettingsService} from '../../../services/webui-settings.service';
import {Subscription} from 'rxjs';
import {UtilService} from '../../../services/util.service';
import {WebSocket} from '../../../services/webSocket';

@Component({
  selector: 'app-console',
  templateUrl: './console.component.html',
  styleUrls: ['./console.component.scss']
})
export class ConsoleComponent implements OnInit, OnDestroy {

  @ViewChild('editor', {static: false}) codeEditor;
  @ViewChild('historySearchInput') historySearchInput;

  history: Map<string, SqlHistory> = new Map<string, SqlHistory>();
  readonly MAXHISTORY = 50;//maximum items in history

  resultSets: ResultSet[];
  collapsed: boolean[];
  queryAnalysis: InformationPage;
  analyzeQuery = true;
  showingAnalysis = false;
  websocket: WebSocket;
  private subscriptions = new Subscription();
  loading = false;
  lang = 'mql';
  saveInHistory = true;
  showSearch = false;
  historySearchQuery = "";
  confirmDeletingHistory;

  tableConfig: TableConfig = {
    create: false,
    update: false,
    delete: false,
    sort: false,
    search: false,
    exploring: false
  };

  constructor(
    private formBuilder: FormBuilder,
    private _crud: CrudService,
    private _leftSidebar: LeftSidebarService,
    private _breadcrumb: BreadcrumbService,
    private _settings: WebuiSettingsService,
    public _util: UtilService
  ) {
    const self = this;
    this.websocket = new WebSocket(_settings);
    // hit alt-enter to execute a query with the current "save in history" option
    // hit alt-shift-enter to execute a query in "incognito" mode, no matter of the current "save in history" option
    window.onkeydown = function (e) {
      if( e.key === 'Enter' && e.altKey ){
        if( e.shiftKey ) {
          self.saveInHistory = false;
        }
        self.submitQuery();
      }
    };
    this.initWebsocket();
  }

  ngOnInit() {
    SqlHistory.fromJson(localStorage.getItem('sql-history'), this.history);
    this._breadcrumb.hide();
  }

  ngOnDestroy() {
    this._leftSidebar.close();
    this.subscriptions.unsubscribe();
    this.websocket.close();
    this._breadcrumb.hide();
    window.onbeforeunload = null;
    window.onkeydown = null;
  }

  submitQuery() {
    const code = this.codeEditor.getCode();
    if( !code ) {
      return;
    }
    if(this.saveInHistory) {
      this.addToHistory(code);
    }
    this._leftSidebar.setNodes([]);
    if (this.analyzeQuery) {
      this._leftSidebar.open();
    } else {
      this._leftSidebar.close();
    }
    this.queryAnalysis = null;

    this.loading = true;
    if(!this._crud.anyQuery(this.websocket, new QueryRequest(code, this.analyzeQuery, this.lang))){
      this.loading = false;
      this.resultSets = [new ResultSet('Could not establish a connection with the server.', code)];
    }
  }

  collapseAll( collapse: boolean ) {
    this.collapsed.fill(collapse);
  }

  addToHistory(query: string): void {
    if (this.history.size >= this.MAXHISTORY) {
      let h: SqlHistory = new SqlHistory('');
      this.history.forEach((val, key) => {
        if (val.time < h.time) {
          h = val;
        }
      });
      this.history.delete(h.query);
    }
    const newHistory = new SqlHistory(query);
    this.history.set(newHistory.query, newHistory);

    localStorage.setItem('sql-history', JSON.stringify(Array.from(this.history.values())));
  }

  applyHistory(query: string, run: boolean) {
    this.codeEditor.setCode(query);
    if (run) {
      this.submitQuery();
    }
  }

  deleteHistoryItem( key, e ){
    if(this.confirmDeletingHistory===key){
      this.history.delete(key);
      localStorage.setItem('sql-history', JSON.stringify(Array.from(this.history.values())));
    } else {
      this.confirmDeletingHistory = key;
    }
    e.stopPropagation();
  }

  //from: https://stackoverflow.com/questions/52793944/angular-keyvalue-pipe-sort-properties-iterate-in-order
  orderHistory(a: KeyValue<string, SqlHistory>, b: KeyValue<string, SqlHistory>) {
    return a.value.time > b.value.time ? -1 : (b.value.time > a.value.time ? 1 : 0);
  }

  openHistorySearch() {
    this.showSearch=true;
    setTimeout(
      () => this.historySearchInput.nativeElement.focus(),
      1
    );
  }

  closeHistorySearch() {
    this.showSearch=false;
    this.historySearchQuery='';
  }


  initWebsocket() {
    //function to define behavior when clicking on a page link
    const nodeBehavior = (tree, node, $event) => {
      if (node.data.id === 'console') {
        //this.queryAnalysis = null;
        this.showingAnalysis = false;
        this._breadcrumb.hide();
        node.setIsActive(true);
        return;
      }
      const split = node.data.routerLink.split('/');
      const analyzerId = split[0];
      const analyzerPage = split[1];
      if (analyzerId !== undefined && analyzerPage !== undefined) {
        this._crud.getAnalyzerPage(analyzerId, analyzerPage).subscribe(
          res => {
            this.queryAnalysis = <InformationPage>res;
            this.showingAnalysis = true;
            this._breadcrumb.setBreadcrumbs([new BreadcrumbItem(node.data.name)]);
            if( this.queryAnalysis.fullWidth ) this._breadcrumb.hideZoom();
            node.setIsActive(true);
          }, err => {
            console.log(err);
          }
        );
      }
    };

    const sub = this.websocket.onMessage().subscribe(
      msg => {

        //if msg contains nodes of the sidebar
        if (Array.isArray(msg) && msg[0].hasOwnProperty('routerLink')) {
          const sidebarNodesTemp: SidebarNode[] = <SidebarNode[]>msg;
          const sidebarNodes: SidebarNode[] = [];
          const labels = new Set();
          sidebarNodesTemp.sort( this._leftSidebar.sortNodes ).forEach((s) => {
            if(s.label){
              labels.add(s.label);
            } else {
              sidebarNodes.push(SidebarNode.fromJson(s, {allowRouting: false, action: nodeBehavior}));
            }
          });
          for( const l of [...labels].sort() ){
            sidebarNodes.push( new SidebarNode(l, l).asSeparator() );
            sidebarNodesTemp.filter((n) => n.label === l ).sort( this._leftSidebar.sortNodes ).forEach(( n ) => {
              sidebarNodes.push(SidebarNode.fromJson(n, {allowRouting: false, action: nodeBehavior}));
            });
          }

          sidebarNodes.unshift(new SidebarNode('console', 'console', 'fa fa-keyboard-o').setAction(nodeBehavior));
          this._leftSidebar.setNodes(sidebarNodes);
          if (sidebarNodes.length > 0) {
            this._leftSidebar.open();
          } else {
            this._leftSidebar.close();
          }
        }


        // array of ResultSets
        else if (Array.isArray(msg) && (msg[0].hasOwnProperty('data') || msg[0].hasOwnProperty('affectedRows') || msg[0].hasOwnProperty('error'))) {
          this.loading = false;
          this.resultSets = <ResultSet[]>msg;
          this.collapsed = new Array(this.resultSets.length);
          this.collapsed.fill(false);
        }

        //if msg contains a notification of a changed information object
        else if (msg.hasOwnProperty('type')) {
          const iObj = <InformationObject>msg;
          if (this.queryAnalysis) {
            const group = this.queryAnalysis.groups[iObj.groupId];
            if (group != null) {
              group.informationObjects[iObj.id] = iObj;
            }
          }
        }
      },
      err => {
        //this._leftSidebar.setError('Lost connection with the server.');
        setTimeout(() => {
          this.initWebsocket();
        }, +this._settings.getSetting('reconnection.timeout'));
      });
    this.subscriptions.add(sub);
  }

  formatQuery() {
    let code = this.codeEditor.getCode();
    if( !code ) {
      return;
    }
    
    const splitters = ['aggregate(', 'find('];
    let before = '';
    let after = '';
    let cont = false;
    for (const splitter of splitters) {
      if( code.includes(splitter)){
        cont = true;
        const splits = code.split(splitter);
        code = splits[1];
        before = splits[0] + splitter;
        break;
      }
    }
    if ( !cont ){
      return;
    }
    if ( code.charAt(code.length - 1) === ')'){
      code = code.substring(0, code.length - 1);
      after = ')';
    }

    this.codeEditor.setCode(before + this.trySplit(code) + after);
  }

  parse( code:string ){
    console.log(code);
    return JSON.stringify(JSON.parse(code), null, 4);
  }

  private trySplit(code: string) {
    let open = 0;
    let openSquare = 0;
    let lastStart = 0;
    const intervals:Pair[] = [];
    for ( let i = 0; i < code.length; i++ ){
      const now = code.charAt(i);
      if ( now === '{'){
        open++;
      }else if ( now === '}') {
        open--;
      }else if ( now === '[') {
        openSquare++;
      }else if ( now === ']'){
        openSquare--;
      }else if ( now === ',' && open === 0 && openSquare === 0){
        // between
        intervals.push(new Pair( lastStart,i - 1 ));
        lastStart = i + 1;
      }
      if ( i === code.length - 1 && (( now === '}' && open === 0 ) || (now === ']' && openSquare === 0 ))) {
        // end of doc or array
        intervals.push(new Pair( lastStart, i ));
      }
    }
    const parsed:string[] = [];

    intervals.forEach(interval => {
      try {
        parsed.push(this.parse(code.substring(interval.left, interval.right + 1)));
      }catch(e){
        __t
      }
    });
    
    return parsed.join(',\n');
  }


}

class Pair{
  left: number;
  right: number;


  constructor(left: number, right: number) {
    this.left = left;
    this.right = right;
  }
}
