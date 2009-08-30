/**
 * @fileOverview
 * @name prompt.js
 * @author mooz <stillpedant@gmail.com>
 * @license The MIT License
 */

KeySnail.Prompt = function () {
    // ================ private ================ //

    var modules = null;

    // DOM Objects
    var promptbox = null;
    var label = null;
    var textbox = null;
    var listbox = null;

    // Callbacks
    var currentCallback = null;
    var currentUserArg = null;

    var savedFocusedElement = null;

    // Options
    var substrMatch = true;

    var currentHead = null;
    var compIndex = null;
    var compIndexList = null;
    var inNormalCompletion = false;

    var listboxMaxRows = 10;

    // History
    var historyHolder = null;
    var history = {
        list: null,
        index: 0,
        state: false,
        name: "History"
    };

    // Completion
    var completion = {
        list: null,
        index: 0,
        state: false,
        name: "Completion"
    };

    function onBlur() {
        finish(true);
    }

    var oldSelectionStart = 0;
    function handleKeyDown(aEvent) {
        // Some KeyPress event is grabbed by KeySnail and stopped.
        // So we need to listen the keydown event for resetting the misc values.
        switch (aEvent.keyCode) {
        case KeyEvent.DOM_VK_TAB:
        case KeyEvent.DOM_VK_SHIFT:
            break;
        default:
            if (textbox.selectionStart != oldSelectionStart &&
                textbox.selectionStart != textbox.value.length) {
                currentHead = null;
                inNormalCompletion = false;

                // reset completion list index
                compIndexList = null;
                compIndex = 0;

                resetState(completion);
                resetState(history);
            }
            oldSelectionStart = textbox.selectionStart;
            break;
        }
    }

    function handleKeyPress(aEvent) {
        switch (aEvent.keyCode) {
        case KeyEvent.DOM_VK_ESCAPE:
            finish(true);
            break;
        case KeyEvent.DOM_VK_RETURN:
        case KeyEvent.DOM_VK_ENTER:
            finish();
            break;
        case KeyEvent.DOM_VK_UP:
            if (completion.state) {
                fetchItem(completion, -1, true, true, substrMatch, true);
                return;
            }

            if (history.state) {
                fetchItem(history, -1);
            } else {
                fetchItem(history, 0);
                history.state = true;
            }

            // reset completion index
            resetState(completion);
            break;
        case KeyEvent.DOM_VK_DOWN:
            if (completion.state) {
                fetchItem(completion, 1, true, true, substrMatch, true);
                return;
            }

            if (history.state) {
                fetchItem(history, 1);
            } else {
                fetchItem(history, 0);
                history.state = true;
            }
            // reset completion index
            resetState(completion);
            break;
        case KeyEvent.DOM_VK_TAB:
            modules.util.stopEventPropagation(aEvent);

            if (completion.state) {
                fetchItem(completion, aEvent.shiftKey ? -1 : 1, true, true, substrMatch, true);
            } else {
                fetchItem(completion, 0, true, true, substrMatch, true);
                completion.state = true;
            }
            // reset history index
            resetState(history);
            break;
        default:
            break;
        }
    }

    // function setColumns(aColumn) {
    //     removeAllChilds(listbox.childNodes[0]);
    //     var item;
    //     for (var i = 0; i < aColumn; ++i) {
    //         item = document.createElement("listcol");
    //         item.setAttribute("flex", 1);
    //         listbox.childNodes[0].appendChild(item);
    //     }
    // },

    // function removeAllChilds(aElement) {
    //     while (aElement.hasChildNodes()) {
    //         aElement.removeChild(aElement.firstChild);
    //     }
    // },

    // function createRow() {
    //     var row = document.createElement("listitem");

    //     if (arguments.length > 1) {
    //         var cell;

    //         //   arg1 , arg2 , arg3 , ... ,
    //         // | col1 | col2 | col3 | ... |
    //         for (var i = 0; arguments.length; ++i) {
    //             cell = document.createElement("listcell");
    //             cell.setAttribute("label", arguments[i]);
    //             row.appendChild(cell);
    //         }    
    //     } else {
    //         row.setAttribute("label", arguments[0]);
    //     }

    //     return row;
    // },

    function setListBoxFromStringList(aType) {
        var row;

        while (listbox.hasChildNodes()) {
            listbox.removeChild(listbox.firstChild);
        }

        for (var i = 0; i < aType.list.length; ++i) {
            row = document.createElement("listitem");
            row.setAttribute("label", aType.list[i]);
            listbox.appendChild(row);
        }
    }

    function setListBoxFromIndexList(aType) {
        var row;

        while (listbox.hasChildNodes()) {
            listbox.removeChild(listbox.firstChild);
        }

        for (var i = 0; i < compIndexList.length; ++i) {
            row = document.createElement("listitem");
            row.setAttribute("label", aType.list[compIndexList[i]]);
            listbox.appendChild(row);
        }
    }

    function setListBoxSelection(aIndex) {
        listbox.selectedIndex = aIndex;

        var offset = listbox.getNumberOfVisibleRows() / 2;
        var dest = Math.max(0, aIndex - offset);
        if (dest > listbox.getRowCount() - 2 * offset)
            dest = listbox.getRowCount() - 2 * offset;

        listbox.scrollToIndex(dest);
    }

    function resetState(aType) {
        aType.index = 0;
        aType.state = false;
    }

    function getNextIndex(aCurrent, aDirection, aMin, aMax, aRing) {
        var index = aCurrent + aDirection;
        if (index < aMin)
            index = aRing ? aMax - 1 : aMin;
        if (index >= aMax)
            index = aRing ? 0 : aMax - 1;

        return index;
    }

    /**
     * 
     * @param {object} aType history, completion
     * @param {int} aDirection 0, -1, 1
     * @param {boolean} aExpand if this value is true, "head" expands greedly
     * @param {boolean} aRing whether connect completion list head and tail or not
     * @param {boolean} aSubstrMatch whether use substring match or not
     * @param {boolean} aNoSit whether move caret or not
     */
    function fetchItem(aType, aDirection, aExpand, aRing, aSubstrMatch, aNoSit) {
        if (!aType.list || !aType.list.length) {
            modules.display.echoStatusBar("No " + aType.name + " found", 1000);
            return;            
        }

        var index;
        // get cursor position
        var start = textbox.selectionStart;

        // modules.display.prettyPrint("rows ::" + listbox.rows + "\n" +
        //                                  "height ::" + listbox.height);

        if (start == 0 || inNormalCompletion) {
            // get {current / next / previous} index
            index = getNextIndex(aType.index, aDirection, 0, aType.list.length, aRing);

            if (!inNormalCompletion) {
                // at first time
                setListBoxFromStringList(aType);
                listbox.setAttribute("rows",
                                     (aType.list.length < listboxMaxRows) ?
                                     aType.list.length : listboxMaxRows);
                listbox.hidden = false;
            }
            setListBoxSelection(index);

            // normal completion (not the substring matching)
            inNormalCompletion = true;
        } else {
            inNormalCompletion = false;

            // header / substring match
            var header;

            var listLen = aType.list.length;
            var delta = (aDirection >= 0) ? 1 : -1;
            var substrIndex;

            if (currentHead != null && compIndexList) {
                // use current completion list
                var nextCompIndex = getNextIndex(compIndex, aDirection,
                                                 0, compIndexList.length, aRing);

                index = compIndexList[nextCompIndex];
                compIndex = nextCompIndex;
                setListBoxSelection(nextCompIndex);
            } else {
                // generate new completion list
                compIndexList = [];

                header = textbox.value.slice(0, start);
                currentHead = header;

                for (var i = 0; i < listLen; ++i) {
                    if (aType.list[i].slice(0, header.length) == header ||
                        (aSubstrMatch && aType.list[i].indexOf(header) != -1)) {
                        compIndexList.push(i);
                    }
                }

                if (compIndexList.length == 0) {
                    compIndexList = null;
                    modules.display.echoStatusBar("No match for [" + currentHead + "]");
                    currentHead = null;
                    return;
                }

                index = compIndexList[0];

                if (aExpand) {
                    var newSubstrIndex = getCommonSubstrIndex(aType.list, compIndexList);
                    currentHead = aType.list[index].slice(0, newSubstrIndex);
                    oldSelectionStart = newSubstrIndex;
                }

                setListBoxFromIndexList(aType);
                setListBoxSelection(0);

                // show
                listbox.setAttribute("rows",
                                     (compIndexList.length < listboxMaxRows) ?
                                     compIndexList.length : listboxMaxRows);
                listbox.hidden = false;
            }
        }

        if (inNormalCompletion) {
            modules.display.echoStatusBar(aType.name + " (" + (index + 1) +  " / " + aType.list.length + ")");
        } else {
            modules.display.echoStatusBar(aType.name + " Match for [" + currentHead + "]" +
                                               " (" + (compIndex + 1) +  " / " + compIndexList.length + ")");
        }

        // set new text
        textbox.value = aType.list[index];
        aType.index = index;

        if (aNoSit) {
            textbox.selectionStart = textbox.selectionEnd =
                (inNormalCompletion) ?
                textbox.value.length : currentHead.length;
        } else {
            textbox.selectionStart = textbox.selectionEnd = start;
        }
    }

    /**
     * if these string given,
     * command.hoge
     * command.huga
     * command.hoho
     * ________^___ <= return ^ index
     * @param {} aStringList
     * @param {} aIndexList
     * @returns {integer} common substring beginning index
     */
    function getCommonSubstrIndex(aStringList, aIndexList) {
        var i = 1;
        while (true) {
            var header = aStringList[aIndexList[0]].slice(0, i);

            if (aIndexList.some(
                    function (strIndex) {
                        return (aStringList[strIndex].slice(0, i) != header)
                            || (i > aStringList[strIndex].length);
                    }
                )) {
                    break;
                }

            i++;
        }

        return i - 1;
    }

    /**
     * Finish inputting and current the prompt and If user can
     * @param {boolean} aCancelled true, if user cancelled the prompt
     */
    function finish(aCancelled) {
        textbox.removeEventListener('blur', onBlur, false);
        textbox.removeEventListener('keypress', handleKeyPress, false);
        textbox.removeEventListener('keydown', handleKeyDown, false);

        // We need to call focus() here
        // because the callback sometimes change the current selected tab
        // e.g. opening the URL in a new tab, 
        // and the window.focus() does not work that time.
        if (savedFocusedElement) {
            savedFocusedElement.focus();
            savedFocusedElement = null;
        }

        try {
            if (currentCallback) {
                var readStr = aCancelled ? null : textbox.value;

                currentCallback(readStr, currentUserArg);

                if (!aCancelled && readStr.length)
                    history.list.unshift(readStr);

                currentCallback = null;
            }            
        } catch (x) {
            currentCallback = null;
        }

        currentUserArg = null;

        currentHead = null;
        inNormalCompletion = false;

        promptbox.hidden = true;
        listbox.hidden = true;

        textbox.value = "";
        label.value = "";

        resetState(history);
        resetState(completion);
    }

    // ================ public ================ //

    return {
        // ==== common ====

        init: function () {
            modules = this.modules;

            this.message("Prompt Init called");
            if (KeySnail.windowType == "navigator:browser") {
                promptbox = document.getElementById("keysnail-prompt");
                label     = document.getElementById("keysnail-prompt-label");
                textbox   = document.getElementById("keysnail-prompt-textbox");

                listbox   = document.getElementById("keysnail-completion-list");

                // this holds all history and 
                historyHolder = new Object;
                historyHolder["default"] = [];
            }
        },

        // handleEvent: function (aEvent) {
        //     switch (aEvent.type) {
        //     case 'keypress':
        //         handleKeyPress(aEvent);
        //         break;
        //     case 'keydown':
        //         handleKeyDown(aEvent);
        //         break;
        //     case 'blur':
        //         onBlur();
        //         break;
        //     }
        // },

        /**
         * Read string from prompt and execute <aCallback>
         * @param {string} aMsg message to be displayed
         * @param {function} aCallback function to execute after read
         * @param {object} aUserArg any object which will be passed to the <aCallback>
         * <aCallback> must take two arguments like below.
         * function callback(aReadStr, aUserArg);
         * The first aReadStr becomes the string read from prompt
         * The second arguments
         * @param {[string]} aCollection string list used to completion
         * @param {string} aInitialInput
         * @param {string} aInitialCount
         * @param {string} aGroup history group
         */
        read: function read(aMsg, aCallback, aUserArg, aCollection, aInitialInput, aInitialCount, aGroup) {
            if (!promptbox)
                return;

            if (currentCallback) {
                this.modules.display.echoStatusBar("Prompt is already used by another command");
                return;
            }

            savedFocusedElement = window.document.commandDispatcher.focusedElement || window.content.window;

            // set up history
            history.index = 0;
            aGroup = aGroup || "default";
            if (aGroup && typeof(historyHolder[aGroup]) == "undefined")
                historyHolder[aGroup] = [];
            history.list = historyHolder[aGroup];

            // set up completion
            completion.list = aCollection;
            completion.index = aInitialCount || 0;

            // set up callbacks
            currentCallback = aCallback;
            currentUserArg = aUserArg;

            // display prompt box
            label.value = aMsg;
            textbox.value = aInitialInput || "";
            promptbox.hidden = false;
            // do not set selection value till textbox appear (cause crash)
            textbox.selectionStart = textbox.selectionEnd = 0;

            // now focus to the input area
            textbox.focus();
            // add event listener
            textbox.addEventListener('blur', onBlur, false);
            textbox.addEventListener('keypress', handleKeyPress, false);
            textbox.addEventListener('keydown', handleKeyDown, false);

            modules.display.echoStatusBar("[ <tab> : begin / next completion ] [shift + <tab> prev completion ] [<up>, <down> begen trailing history / trail completion]");
        },

        message: KeySnail.message
    };
}();
