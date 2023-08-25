import {ChangeDetectorRef, Component, ElementRef, forwardRef, Input, OnInit, Renderer2, ViewChild} from '@angular/core';
import {Toast} from '../toaster.model';
import {KeyValue} from '@angular/common';
import {ModalDirective} from 'ngx-bootstrap/modal';
import {ResultException} from '../../data-view/models/result-set.model';
import {UtilService} from '../../../services/util.service';

import {ToastBodyComponent, ToastComponent as ToastParent, ToasterService} from '@coreui/angular';
import {BehaviorSubject, Observable} from 'rxjs';

@Component({
  selector: 'app-toast',
  templateUrl: './toast.component.html',
  styleUrls: ['./toast.component.scss'],
  providers: [{ provide: ToastComponent, useExisting: forwardRef(() => ToastParent) }]
})
export class ToastComponent extends ToastParent {

  exception: ResultException;
  @ViewChild('stackTraceModal', {static: false}) public stackTraceModal: ModalDirective;
  
  public toast: BehaviorSubject<Toast> = new BehaviorSubject<Toast>(null);
  
  constructor(
      public override hostElement: ElementRef,
      public override renderer: Renderer2,
      public override toasterService: ToasterService,
      public override changeDetectorRef: ChangeDetectorRef) {
    super(hostElement, renderer, toasterService, changeDetectorRef);
  }
  
  
  ngOnInit( ): void {
  }

  /**
   * show newest toasts before the older ones
   */
  orderToasts(a: KeyValue<string, any>, b: KeyValue<string, any>) {
    return b.value.time - a.value.time;
  }

  getToastClass(toast: Toast) {
    let cssClass = toast.type;
    if (toast.exception) {
      cssClass = cssClass + ' exception';
    }
    return cssClass;
  }

  showStackTraceModal(toast: Toast) {
    if (toast.exception) {
      this.exception = toast.exception;
      this.stackTraceModal.show();
    }
  }

  copyGeneratedQuery(toast: Toast) {
    //this._util.clipboard(toast.generatedQuery);
  }

}