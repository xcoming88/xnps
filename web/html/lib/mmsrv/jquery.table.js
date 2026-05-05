(function ($) {
    const STATE_KEY = 'mmsrvTable_state';

    $.fn.table = function (options, param) {
        if (typeof options === 'string') {
            const method = $.fn.table.methods[options];
            if (method) {
                return method(this, param);
            }
            return this;
        }

        const defaults = {
            columns: [[]],
            data: [],
            rowHeight: 32,
            showHeader: true,
            showFilter: true,
            fitColumns: true,
            singleSelect: true, 
            onClickRow: null   
        };
        const settings = $.extend({}, defaults, options);

        return this.each(function () {
            const $container = $(this);
            $container.empty().css({
                position: 'relative', overflow: 'hidden', width: '100%', height: '100%'
            });

            const state = {
                allData: settings.data,
                filteredData: settings.data,
                columns: settings.columns[0] || [],
                visibleRowsCount: 0,
                bufferRows: 2,
                filters: {},
                selectedRows: new Set(), 
                applyFilter: function () { applyFilter(); },
                resizeTable: function () { resizeTable(); },
                renderView: function () { renderView(); }
            };
            $container.data(STATE_KEY, state);

            const cols = state.columns;

            // 🚀 物理优化：$viewport 使用原生横向滚动条，内容溢出时由浏览器自动托管
            // 🚀 物理优化：$viewport 强制单向溢出，绝对屏蔽纵向原生滚动条
            const $viewport = $('<div class="mmsrv-table-view" style="position:absolute; left:0; right:18px; top:0; bottom:0; overflow-x:auto; overflow-y:hidden !important;"></div>').appendTo($container);
            const $table = $('<table class="datagrid-htable datagrid-btable" style="table-layout:auto; border-collapse:collapse; background:#fff; min-width:100%; width:max-content; display:table;"></table>').appendTo($viewport);

            const $colgroup = $('<colgroup></colgroup>').appendTo($table);

            // 右侧廊道：保持纵向虚拟滚动的控制权
            const $scrollCorridor = $('<div class="mmsrv-scroll-corridor" style="position:absolute; right:0; top:0; bottom:0; width:18px; background:#f9f9f9; border-left:1px solid #ddd; display:flex; flex-direction:column; z-index:10;"></div>').appendTo($container);
            const $scrollControls = $('<div class="mmsrv-scroll-ctrls" style="height:32px; background:#f5f5f5; border-bottom:1px solid #ddd; display:flex; flex-direction:column; justify-content:space-around; align-items:center; padding:2px 0;"></div>').appendTo($scrollCorridor);

            const $btnUp = $('<a style="font-size:11px; cursor:pointer; color:#333; height:12px; line-height:12px; user-select:none; font-family:NSimSun;">▲</a>').appendTo($scrollControls);
            const $btnDown = $('<a style="font-size:11px; cursor:pointer; color:#333; height:12px; line-height:12px; user-select:none; font-family:NSimSun;">▼</a>').appendTo($scrollControls);

            $btnUp.on('click', function () {
                const val = parseInt($scrollV.val());
                const max = parseInt($scrollV.attr('max')) || 0;
                $scrollV.val(Math.min(max, val + 3)); 
                renderView();
            });
            $btnDown.on('click', function () {
                const val = parseInt($scrollV.val());
                $scrollV.val(Math.max(0, val - 3)); 
                renderView();
            });

            const $scrollV = $('<input type="range" class="mmsrv-scroll-v" style="flex:1; width:100%; -webkit-appearance: slider-vertical; cursor:pointer;" min="0" value="0">').appendTo($scrollCorridor);
            
            // 3. 构建表头
            const $thead = $('<thead></thead>').appendTo($table);
            const $trHeader = $('<tr class="datagrid-header-row" style="height: ' + settings.rowHeight + 'px; background:#f5f5f5; font-weight:bold;"></tr>').appendTo($thead);
            $trHeader.append('<td style="width:40px; text-align:center; border:1px solid #ccc;"><a class="mmsrv-table-menu" style="cursor:pointer; color:#0066cc;">☰</a></td>');

            // 🍔 菜单下拉
            const $menu = $('<div class="mmsrv-table-dropdown" style="position:absolute; background:#fff; border:1px solid #ccc; box-shadow:0 2px 6px rgba(0,0,0,0.15); border-radius:3px; z-index:9999; display:none; min-width:125px; padding:3px 0;"></div>').appendTo($container);
            const $itemCopy = $('<div style="padding:6px 12px; cursor:pointer; font-size:12px; border-bottom:1px solid #eee;">📋 复制过滤数据</div>').appendTo($menu);
            const $itemFullCopy = $('<div style="padding:6px 12px; cursor:pointer; font-size:12px; border-bottom:1px solid #eee;">🗂️ 全量复制</div>').appendTo($menu);
            const $itemFilter = $('<div style="padding:6px 12px; cursor:pointer; font-size:12px; border-bottom:1px solid #eee;">🔍 显示过滤行</div>').appendTo($menu);
            const $itemJump = $('<div style="padding:6px 12px; cursor:pointer; font-size:12px;">🎯 跳转到行</div>').appendTo($menu);

            $menu.on('mouseenter', 'div', function () { $(this).css('background', '#eaf2ff'); })
                 .on('mouseleave', 'div', function () { $(this).css('background', '#fff'); });

            $container.on('click', '.mmsrv-table-menu', function (e) {
                e.stopPropagation();
                const pos = $(this).offset();
                const containerPos = $container.offset();
                $menu.css({
                    left: Math.max(0, pos.left - containerPos.left) + 'px',
                    top: Math.max(0, pos.top - containerPos.top + settings.rowHeight) + 'px'
                }).toggle();
            });

            $(document).on('click.mmsrvTableMenu', function () { $menu.hide(); });

            function copyToClipboard(data) {
                const formatCell = (val) => {
                    val = (val === undefined || val === null) ? '' : String(val);
                    // 🚀 核心优化：如果内容包含双引号、换行符或制表符，遵循 Excel 规范用双引号包裹，并转义内部的双引号
                    if (val.includes('"') || val.includes('\n') || val.includes('\r') || val.includes('\t')) {
                        return '"' + val.replace(/"/g, '""') + '"';
                    }
                    return val;
                };

                const header = cols.filter(c => !c.checkbox).map(c => formatCell(c.title)).join('\t');
                const rows = data.map(row => {
                    return cols.filter(c => !c.checkbox).map(c => formatCell(row[c.field])).join('\t');
                });
                const text = [header, ...rows].join('\n');

                if (navigator.clipboard && navigator.clipboard.writeText) {
                     navigator.clipboard.writeText(text);
                } else {
                     const $temp = $("<textarea>").val(text).appendTo('body').select();
                     document.execCommand("copy");
                     $temp.remove();
                }

                const $tip = $('<div style="position:fixed; background:rgba(0,0,0,0.8); color:#fff; padding:6px 12px; border-radius:4px; font-size:12px; z-index:100000; left:45%; top:45%;">已复制到剪切板 📋</div>').appendTo('body');
                setTimeout(() => $tip.fadeOut(300, () => $tip.remove()), 1200);
            }

            $itemCopy.on('click', function () { copyToClipboard(state.filteredData); $menu.hide(); });
            $itemFullCopy.on('click', function () { copyToClipboard(state.allData); $menu.hide(); });
            $itemFilter.on('click', function () { if ($trFilter) { $trFilter.show(); resizeTable(); } $menu.hide(); });
            
            $itemJump.on('click', function () {
                $menu.hide();
                const input = prompt("请输入要跳转的行号 (1 - " + state.filteredData.length + "):", "");
                if (input) {
                    const rowNum = parseInt(input);
                    if (!isNaN(rowNum) && rowNum >= 1 && rowNum <= state.filteredData.length) {
                         const max = parseInt($scrollV.attr('max')) || 0;
                         const offset = rowNum - 1;
                         $scrollV.val(Math.max(0, max - offset));
                         renderView();
                    } else {
                         alert("无效的行号");
                    }
                }
            });
            
            cols.forEach(col => {
                if (col.checkbox) {
                    $trHeader.append('<td style="border:1px solid #ccc; width:40px; text-align:center;"><input type="checkbox" class="mmsrv-check-all"></td>');
                } else {
                    $trHeader.append('<td style="border:1px solid #ccc; padding:4px; text-align:center;">' + col.title + '</td>');
                }
            });

            let $trFilter = null;
            if (settings.showFilter) {
                $trFilter = $('<tr class="mmsrv-table-filter-row" style="height: ' + settings.rowHeight + 'px; background:#f9f9f9;"></tr>').appendTo($thead);
                $trFilter.append('<td style="text-align:center; border:1px solid #ccc;"><a class="mmsrv-toggle-filter" style="cursor:pointer; color:#ff3300; font-weight:bold;">✖</a></td>');
                
                cols.forEach(col => {
                    const $td = $('<td style="border:1px solid #ccc; padding:2px; text-align:center;"></td>').appendTo($trFilter);
                    if (col.checkbox) {
                        $td.html('-'); 
                    } else {
                        $('<input type="text" size="1" style="width:100%; display:block; box-sizing:border-box; border:1px solid #ddd; border-radius:3px; padding:2px;" placeholder="筛选...">')
                            .appendTo($td)
                            .on('input', function () {
                                const val = $(this).val().trim().toLowerCase();
                                if (val) state.filters[col.field] = val;
                                else delete state.filters[col.field];
                                applyFilter();
                            });
                    }
                });
            }

            $container.on('click', '.mmsrv-toggle-filter', function () {
                $trFilter.toggle(); resizeTable();
            });

            const $tbody = $('<tbody class="datagrid-body"></tbody>').appendTo($table);

            $container.on('mouseenter', '.datagrid-body tr', function () {
                $(this).addClass('datagrid-row-over');
            }).on('mouseleave', '.datagrid-body tr', function () {
                $(this).removeClass('datagrid-row-over');
            });

            $container.on('click', '.datagrid-body tr', function (e) {
                const max = parseInt($scrollV.attr('max')) || 0;
                const offset = Math.max(0, max - parseInt($scrollV.val()));
                const dataIndex = offset + $(this).index();
                const rowData = state.filteredData[dataIndex];
                if (!rowData) return;

                const isChecked = state.selectedRows.has(rowData);
                if (settings.singleSelect) {
                    state.selectedRows.clear();
                    if (!isChecked) state.selectedRows.add(rowData);
                } else {
                    if (isChecked) state.selectedRows.delete(rowData);
                    else state.selectedRows.add(rowData);
                }

                updateCheckAllState();
                renderView();

                if (settings.onClickRow) {
                    settings.onClickRow.call(this, dataIndex, rowData);
                }
            });

            $container.on('change', '.mmsrv-check-all', function () {
                const checked = $(this).prop('checked');
                state.selectedRows.clear();
                if (checked) {
                    state.filteredData.forEach(row => state.selectedRows.add(row));
                }
                renderView();
            });

            function updateCheckAllState() {
                const $chkAll = $container.find('.mmsrv-check-all');
                if (state.filteredData.length > 0 && state.selectedRows.size === state.filteredData.length) {
                    $chkAll.prop('checked', true);
                } else {
                    $chkAll.prop('checked', false);
                }
            }

            $container.on('dblclick', '.datagrid-body td', function (e) {
                e.stopPropagation(); 
                
                const $td = $(this);
                const $tr = $td.parent();
                
                // 1. 尝试从原始数据中获取 (最纯净，无视 Formatter)
                let text = '';
                const max = parseInt($scrollV.attr('max')) || 0;
                const offset = Math.max(0, max - parseInt($scrollV.val()));
                const dataIndex = offset + $tr.index();
                const rowData = state.filteredData[dataIndex];

                if (rowData) {
                    const tdIndex = $td.index();
                    if (tdIndex > 0) {
                        const col = cols[tdIndex - 1];
                        if (col && col.field) {
                            text = String(rowData[col.field] === undefined ? '' : rowData[col.field]);
                        }
                    }
                }

                // 2. 兜底逻辑
                if (!text) {
                    text = ($td.attr('title') || $td.text()).trim();
                }
                
                if (!text || text === '-') return;
                
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(text);
                } else {
                    const $temp = $("<input>").val(text).appendTo('body').select();
                    document.execCommand("copy");
                    $temp.remove();
                }

                const $tip = $('<div style="position:fixed; background:rgba(0,0,0,0.7); color:#fff; padding:6px 12px; border-radius:4px; font-size:12px; z-index:99999;">已复制: ' + text + '</div>').appendTo('body');
                const offsetPos = $td.offset();
                $tip.css({ left: offsetPos.left + 5, top: offsetPos.top + $td.height() });
                setTimeout(() => $tip.fadeOut(300, () => $tip.remove()), 1200);
            });

            function applyFilter() {
                const keys = Object.keys(state.filters);
                state.filteredData = keys.length === 0 ? state.allData : state.allData.filter(row => {
                    return keys.every(key => String(row[key] || '').toLowerCase().indexOf(state.filters[key]) > -1);
                });
                updateScrollMax();
                renderView();
            }

            function resizeTable() {
                const parentWidth = $viewport.width();
                const headHeight = $thead.height();
                $scrollControls.css('height', headHeight + 'px'); 

                // 🚀 物理补偿：扣除底部原生横向滚动条可能占用的高度（约16px）
                // 确保虚拟计算出的最后一行不被滚动条遮挡
                const bodyHeight = $viewport.height() - headHeight - 16;
                state.visibleRowsCount = Math.max(1, Math.floor(bodyHeight / settings.rowHeight));

                $colgroup.empty();
                $colgroup.append('<col style="width:40px;">');

                cols.forEach(col => {
                    if (col.checkbox) $colgroup.append('<col style="width:40px;">');
                    else $colgroup.append('<col style="min-width:' + (col.width || 100) + 'px;">');
                });

                rebuildDOMPool();
                updateScrollMax();
                renderView();
            }

            function rebuildDOMPool() {
                $tbody.empty();
                const total = state.visibleRowsCount + state.bufferRows;
                for (let i = 0; i < total; i++) {
                    const $tr = $('<tr style="height:' + settings.rowHeight + 'px; border-bottom:1px solid #eee;"></tr>');
                    $tr.append('<td class="row-num" style="width:40px; min-width:40px; text-align:center; background:#f9f9f9; border-right:1px solid #ccc; border-bottom:1px solid #ddd;"></td>');
                    cols.forEach(col => {
                        const mw = (col.checkbox ? 40 : (col.width || 100));
                        $tr.append('<td class="cell-' + col.field + '" style="border-right:1px solid #eee; padding:5px 8px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; border-bottom:1px solid #ddd; text-align:' + (col.align || 'left') + '; min-width:' + mw + 'px;"></td>');
                    });
                    $tbody.append($tr);
                }
            }

            function updateScrollMax() {
                const max = Math.max(0, state.filteredData.length - state.visibleRowsCount);
                $scrollV.attr('max', max);
                $scrollV.val(max); 
            }

            function renderView() {
                const max = parseInt($scrollV.attr('max')) || 0;
                const offset = Math.max(0, max - parseInt($scrollV.val()));
                
                const trList = $tbody.children('tr');
                const viewData = state.filteredData;

                trList.each(function (index) {
                    const dataIndex = offset + index;
                    const $tr = $(this);

                    if (dataIndex < viewData.length) {
                        const rowData = viewData[dataIndex];
                        $tr.show();
                        $tr.find('.row-num').text(dataIndex + 1);

                        if (state.selectedRows.has(rowData)) {
                            $tr.addClass('datagrid-row-selected');
                        } else {
                            $tr.removeClass('datagrid-row-selected');
                        }

                        cols.forEach(col => {
                            const $td = $tr.find('.cell-' + col.field);
                            
                            if (col.checkbox) {
                                const isChecked = state.selectedRows.has(rowData);
                                let $chk = $td.find('input');
                                if (!$chk.length) {
                                    $td.html('<input type="checkbox" style="cursor:pointer;" onclick="return false;">');
                                    $chk = $td.find('input');
                                }
                                if ($chk.prop('checked') !== isChecked) {
                                    $chk.prop('checked', isChecked);
                                }
                            } else {
                                let value = rowData[col.field];
                                const rawValue = value === undefined ? '' : String(value);
                                if ($td.attr('title') !== rawValue) {
                                    $td.attr('title', rawValue);
                                }

                                // 🚀 增加 styler 支持，并处理样式重置
                                $td.attr('style', `border-right:1px solid #eee; padding:5px 8px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; border-bottom:1px solid #ddd; text-align:${col.align || 'left'}; min-width:${col.checkbox ? 40 : (col.width || 100)}px;`);
                                if (col.styler && typeof col.styler === 'function') {
                                    const styleStr = col.styler(value, rowData, dataIndex);
                                    if (styleStr) {
                                        $td.attr('style', $td.attr('style') + ';' + styleStr);
                                    }
                                }

                                if (col.formatter && typeof col.formatter === 'function') {
                                    const newHtml = col.formatter(value, rowData, dataIndex);
                                    if ($td.html() !== newHtml) {
                                        $td.html(newHtml);
                                    }
                                } else {
                                    const newText = value === undefined ? '' : String(value);
                                    if ($td.text() !== newText) {
                                        $td.text(newText);
                                    }
                                }
                            }
                        });
                    } else {
                        $tr.hide();
                    }
                });
            }

            $scrollV.on('input change', function () { renderView(); });

            $container.on('wheel', function (e) {
                const delta = e.originalEvent.deltaY;
                if (!delta) return;

                e.preventDefault(); 
                const max = parseInt($scrollV.attr('max')) || 0;
                if (max <= 0) return;

                const val = parseInt($scrollV.val());
                const step = 3; 

                if (delta > 0) {
                    $scrollV.val(Math.max(0, val - step)); 
                } else {
                    $scrollV.val(Math.min(max, val + step)); 
                }
                renderView();
            });

            const resizeObserver = new ResizeObserver(() => resizeTable());
            resizeObserver.observe($container[0]);

            setTimeout(() => resizeTable(), 50);
        });
    };

    $.fn.table.methods = {
        loadData: function (jq, data) {
            return jq.each(function () {
                const state = $(this).data(STATE_KEY);
                if (state) { state.allData = data; state.selectedRows.clear(); state.applyFilter(); }
            });
        },
        appendRow: function (jq, row) {
            return jq.each(function () {
                const state = $(this).data(STATE_KEY);
                if (state) { state.allData.push(row); state.applyFilter(); }
            });
        },
        deleteRow: function (jq, index) {
            return jq.each(function () {
                const state = $(this).data(STATE_KEY);
                if (state) {
                    const row = state.filteredData[index];
                    if (row) {
                        const allIdx = state.allData.indexOf(row);
                        if (allIdx > -1) state.allData.splice(allIdx, 1);
                        state.selectedRows.delete(row);
                        state.applyFilter();
                    }
                }
            });
        },
        updateRow: function (jq, param) { 
            return jq.each(function () {
                const state = $(this).data(STATE_KEY);
                if (state && param.row) {
                    const row = state.filteredData[param.index];
                    if (row) { $.extend(row, param.row); state.applyFilter(); }
                }
            });
        },
        getSelected: function (jq) {
            const state = jq.data(STATE_KEY);
            if (state && state.selectedRows.size > 0) {
                return Array.from(state.selectedRows)[0];
            }
            return null;
        },
        getSelections: function (jq) {
            const state = jq.data(STATE_KEY);
            if (state) {
                return Array.from(state.selectedRows);
            }
            return [];
        },
        selectAll: function (jq) {
            return jq.each(function () {
                const state = $(this).data(STATE_KEY);
                if (state) {
                    state.filteredData.forEach(row => state.selectedRows.add(row));
                    $(this).find('.mmsrv-check-all').prop('checked', true);
                    state.renderView();
                }
            });
        },
        unselectAll: function (jq) {
            return jq.each(function () {
                const state = $(this).data(STATE_KEY);
                if (state) {
                    state.selectedRows.clear();
                    $(this).find('.mmsrv-check-all').prop('checked', false);
                    state.renderView();
                }
            });
        },
        getData: function (jq) {
            const state = jq.data(STATE_KEY);
            return state ? state.filteredData : [];
        },
        getFullData: function (jq) {
            const state = jq.data(STATE_KEY);
            return state ? state.allData : [];
        },
        scrollTo: function (jq, index) {
            return jq.each(function () {
                const state = $(this).data(STATE_KEY);
                if (state) {
                    const $container = $(this);
                    const $scrollV = $container.find('.mmsrv-scroll-v');
                    const max = parseInt($scrollV.attr('max')) || 0;
                    $scrollV.val(Math.max(0, max - index)); 
                    state.renderView();
                }
            });
        },
        selectRow: function (jq, index) {
            return jq.each(function () {
                const state = $(this).data(STATE_KEY);
                if (state) {
                    const rowData = state.filteredData[index];
                    if (rowData) {
                        state.selectedRows.clear();
                        state.selectedRows.add(rowData);
                        state.renderView();
                    }
                }
            });
        }
    };
})(jQuery);
