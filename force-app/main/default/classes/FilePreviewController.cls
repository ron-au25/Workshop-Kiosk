public with sharing class FilePreviewController {
  /**
   * Latest PDF linked to the Work Order for this Work Step (same files as the checklist panel).
   * Uses ContentDocument.FileType = 'PDF' like the standard file-preview pattern.
   */
  @AuraEnabled(cacheable=true)
  public static Id getRecordPdfId(Id recordId) {
    if (recordId == null) {
      return null;
    }
    Id linkedEntityId = resolveWorkOrderIdForFiles(recordId);
    if (linkedEntityId == null) {
      return null;
    }

    List<ContentDocumentLink> links = [
      SELECT ContentDocumentId
      FROM ContentDocumentLink
      WHERE
        LinkedEntityId = :linkedEntityId
        AND ContentDocument.FileType = 'PDF'
      ORDER BY ContentDocument.LastModifiedDate DESC NULLS FIRST
      LIMIT 1
    ];

    if (!links.isEmpty()) {
      return links[0].ContentDocumentId;
    }
    return null;
  }

  /**
   * PNG files linked to the Work Order (for instruction gallery), sorted by file name ascending.
   * Uses LatestPublishedVersion.PathOnClient when present, otherwise ContentDocument.Title.
   */
  @AuraEnabled(cacheable=true)
  public static List<WorkOrderImageRow> getWorkOrderPngImages(Id recordId) {
    List<WorkOrderImageRow> empty = new List<WorkOrderImageRow>();
    if (recordId == null) {
      return empty;
    }
    Id linkedEntityId = resolveWorkOrderIdForFiles(recordId);
    if (linkedEntityId == null) {
      return empty;
    }
    if (!Schema.sObjectType.ContentDocumentLink.isAccessible()) {
      return empty;
    }

    List<ContentDocumentLink> links = [
      SELECT
        ContentDocumentId,
        ContentDocument.Title,
        ContentDocument.LatestPublishedVersion.PathOnClient
      FROM ContentDocumentLink
      WHERE
        LinkedEntityId = :linkedEntityId
        AND ContentDocument.FileType = 'PNG'
    ];

    Map<Id, WorkOrderImageRow> rowsByDocId = new Map<Id, WorkOrderImageRow>();
    Map<Id, String> sortKeyByDocId = new Map<Id, String>();
    String base = Url.getOrgDomainUrl().toExternalForm();

    for (ContentDocumentLink l : links) {
      Id cid = l.ContentDocumentId;
      if (cid == null) {
        continue;
      }
      if (rowsByDocId.containsKey(cid)) {
        continue;
      }
      WorkOrderImageRow row = new WorkOrderImageRow();
      row.contentDocumentId = cid;
      row.title = l.ContentDocument.Title;
      row.downloadUrl =
        base +
        '/sfc/servlet.shepherd/document/download/' +
        cid +
        '?operationContext=S1';
      rowsByDocId.put(cid, row);
      sortKeyByDocId.put(cid, imageSortKey(l));
    }

    List<ImageSortWrapper> wrappers = new List<ImageSortWrapper>();
    for (Id cid : rowsByDocId.keySet()) {
      ImageSortWrapper w = new ImageSortWrapper();
      w.row = rowsByDocId.get(cid);
      w.sortKey = sortKeyByDocId.get(cid);
      wrappers.add(w);
    }
    wrappers.sort();

    List<WorkOrderImageRow> out = new List<WorkOrderImageRow>();
    for (ImageSortWrapper w : wrappers) {
      out.add(w.row);
    }
    return out;
  }

  private static String imageSortKey(ContentDocumentLink l) {
    String path = l.ContentDocument.LatestPublishedVersion != null
      ? l.ContentDocument.LatestPublishedVersion.PathOnClient
      : null;
    if (path != null && path.trim() != '') {
      return path.trim().toLowerCase();
    }
    return l.ContentDocument.Title != null
      ? l.ContentDocument.Title.toLowerCase()
      : '';
  }

  private class ImageSortWrapper implements Comparable {
    WorkOrderImageRow row;
    String sortKey;

    public Integer compareTo(Object other) {
      ImageSortWrapper o = (ImageSortWrapper) other;
      String a = this.sortKey != null ? this.sortKey : '';
      String b = o.sortKey != null ? o.sortKey : '';
      return a.compareTo(b);
    }
  }

  public class WorkOrderImageRow {
    @AuraEnabled
    public Id contentDocumentId;
    @AuraEnabled
    public String title;
    @AuraEnabled
    public String downloadUrl;
  }

  /**
   * Download URL for embed / open in new tab (same-origin shepherd URL).
   */
  @AuraEnabled(cacheable=true)
  public static PdfMetadata getPdfMetadata(Id contentDocumentId) {
    if (contentDocumentId == null) {
      return null;
    }
    if (!Schema.sObjectType.ContentDocument.isAccessible()) {
      return null;
    }
    List<ContentDocument> docs = [
      SELECT Title
      FROM ContentDocument
      WHERE Id = :contentDocumentId
      LIMIT 1
    ];
    if (docs.isEmpty()) {
      return null;
    }
    PdfMetadata meta = new PdfMetadata();
    meta.title = docs[0].Title;
    String base = Url.getOrgDomainUrl().toExternalForm();
    meta.downloadUrl =
      base +
      '/sfc/servlet.shepherd/document/download/' +
      contentDocumentId +
      '?operationContext=S1';
    return meta;
  }

  public class PdfMetadata {
    @AuraEnabled
    public String title;
    @AuraEnabled
    public String downloadUrl;
  }

  private static Id resolveWorkOrderIdForFiles(Id workStepId) {
    WorkStep ws = [
      SELECT WorkOrderId, ParentRecordId
      FROM WorkStep
      WHERE Id = :workStepId
      LIMIT 1
    ];

    if (ws.WorkOrderId != null) {
      return ws.WorkOrderId;
    }

    Id parentId = ws.ParentRecordId;
    if (parentId == null) {
      return null;
    }

    String parentType = parentId.getSobjectType().getDescribe().getName();
    if ('WorkOrder'.equals(parentType)) {
      return parentId;
    }
    if ('WorkOrderLineItem'.equals(parentType)) {
      WorkOrderLineItem woli = [
        SELECT WorkOrderId
        FROM WorkOrderLineItem
        WHERE Id = :parentId
        LIMIT 1
      ];
      return woli.WorkOrderId;
    }
    return null;
  }
}
