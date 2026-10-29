#!/usr/bin/env python3
"""Builds the FinPace Shortcut (shortcuts/FinPace.shortcut) from code, so nobody builds it by hand.

One Shortcut for every household: it holds no key. On install, iOS asks for the household key
(an import question on the first action). Each iPhone's Wallet automation runs it with a
Dictionary of the purchase (merchant, amount, card, name), which it sends as `wallet` with the
key and the iPhone's name; the server answers with a `message` it shows as a notification, or
with the category menu for a new place (shortcuts/SPEC.md).

    python3 shortcuts/build_finpace.py            # writes and signs shortcuts/FinPace.shortcut
    python3 shortcuts/build_finpace.py --key KEY --name "FinPace Test" --out /tmp/t.shortcut
        # a copy with a key inside and no import question, for testing with `shortcuts run`

Signing needs macOS (`shortcuts sign`). The file format isn't documented by Apple; this follows
what the Shortcuts app itself writes.
"""
import argparse
import plistlib
import subprocess
import tempfile
import uuid

FUNCTIONS = "https://npwqqtdtqupacofkzqgr.supabase.co/functions/v1"
OBJ = "￼"  # where a variable sits inside a text field


def new_id():
    return str(uuid.uuid4()).upper()


def output(action_uuid, name, as_text=False):
    v = {"OutputUUID": action_uuid, "Type": "ActionOutput", "OutputName": name}
    if as_text:
        v["Aggrandizements"] = [{"Type": "WFCoercionVariableAggrandizement", "CoercionItemClass": "WFStringContentItem"}]
    return v


def named(var):
    return {"Type": "Variable", "VariableName": var}


SHORTCUT_INPUT = {"Type": "ExtensionInput"}


def tokens(*parts):
    """A text field made of plain strings and variables."""
    s, att = "", {}
    for p in parts:
        if isinstance(p, str):
            s += p
        else:
            att["{%d, 1}" % len(s)] = p
            s += OBJ
    return {"Value": {"string": s, "attachmentsByRange": att}, "WFSerializationType": "WFTextTokenString"}


def attachment(v):
    return {"Value": v, "WFSerializationType": "WFTextTokenAttachment"}


def field(key, value):
    return {"WFItemType": 0, "WFKey": tokens(key), "WFValue": tokens(value)}


def json_body(fields):
    return {"Value": {"WFDictionaryFieldValueItems": [field(k, v) for k, v in fields]},
            "WFSerializationType": "WFDictionaryFieldValue"}


def action(identifier, **params):
    return {"WFWorkflowActionIdentifier": f"is.workflow.actions.{identifier}", "WFWorkflowActionParameters": params}


def build(key, name):
    a = []
    t_key, t_dev, t_url, t_status = new_id(), new_id(), new_id(), new_id()
    t_tx, t_prompt, t_names, t_choose = new_id(), new_id(), new_id(), new_id()
    t_ask, t_url2, t_msg2, t_msg1 = new_id(), new_id(), new_id(), new_id()
    g_main, g_new = new_id(), new_id()

    # 0  the household key (asked for on install)
    a.append(action("gettext", UUID=t_key, WFTextActionText=key))
    # 1  this iPhone's name, which tells the household's phones apart
    a.append(action("getdevicedetails", UUID=t_dev, WFDeviceDetail="Device Name"))
    # 2  send the purchase
    a.append(action("downloadurl", UUID=t_url, WFURL=f"{FUNCTIONS}/capture", WFHTTPMethod="POST",
                    WFHTTPBodyType="JSON", ShowHeaders=True,
                    WFJSONValues=json_body([("token", output(t_key, "Text")),
                                            ("device", output(t_dev, "Device Details")),
                                            ("wallet", SHORTCUT_INPUT)])))
    # 3  status
    a.append(action("getvalueforkey", UUID=t_status, WFDictionaryKey="status",
                    WFInput=attachment(output(t_url, "Contents of URL"))))
    # 4  If status is needs_input: a new place asks for its category
    a.append(action("conditional", GroupingIdentifier=g_main, WFControlFlowMode=0, WFCondition=4,
                    WFConditionalActionString="needs_input",
                    WFInput={"Type": "Variable", "Variable": attachment(output(t_status, "Dictionary Value", True))}))
    a.append(action("getvalueforkey", UUID=t_tx, WFDictionaryKey="transaction_id",
                    WFInput=attachment(output(t_url, "Contents of URL"))))
    a.append(action("setvariable", WFVariableName="TxId", WFInput=attachment(output(t_tx, "Dictionary Value"))))
    a.append(action("getvalueforkey", UUID=t_prompt, WFDictionaryKey="prompt",
                    WFInput=attachment(output(t_url, "Contents of URL"))))
    a.append(action("setvariable", WFVariableName="Prompt", WFInput=attachment(output(t_prompt, "Dictionary Value"))))
    a.append(action("getvalueforkey", UUID=t_names, WFDictionaryKey="category_names",
                    WFInput=attachment(output(t_url, "Contents of URL"))))
    a.append(action("choosefromlist", UUID=t_choose, WFInput=attachment(output(t_names, "Dictionary Value")),
                    WFChooseFromListActionPrompt=tokens(named("Prompt"))))
    #    "New category" in the menu asks for its name
    a.append(action("conditional", GroupingIdentifier=g_new, WFControlFlowMode=0, WFCondition=99,
                    WFConditionalActionString="New category",
                    WFInput={"Type": "Variable", "Variable": attachment(output(t_choose, "Chosen Item", True))}))
    a.append(action("ask", UUID=t_ask, WFInputType="Text", WFAskActionPrompt="New category name · שם הקטגוריה החדשה"))
    a.append(action("setvariable", WFVariableName="NewCategory", WFInput=attachment(output(t_ask, "Provided Input"))))
    a.append(action("conditional", GroupingIdentifier=g_new, WFControlFlowMode=2))
    a.append(action("downloadurl", UUID=t_url2, WFURL=f"{FUNCTIONS}/capture/confirm", WFHTTPMethod="POST",
                    WFHTTPBodyType="JSON", ShowHeaders=True,
                    WFJSONValues=json_body([("token", output(t_key, "Text")),
                                            ("device", output(t_dev, "Device Details")),
                                            ("transaction_id", named("TxId")),
                                            ("category_name", output(t_choose, "Chosen Item")),
                                            ("new_category_name", named("NewCategory"))])))
    a.append(action("getvalueforkey", UUID=t_msg2, WFDictionaryKey="message",
                    WFInput=attachment(output(t_url2, "Contents of URL"))))
    a.append(action("notification", WFNotificationActionTitle="FinPace",
                    WFNotificationActionBody=tokens(output(t_msg2, "Dictionary Value"))))
    # Otherwise: where it went and what's left, or what went wrong
    a.append(action("conditional", GroupingIdentifier=g_main, WFControlFlowMode=1))
    a.append(action("getvalueforkey", UUID=t_msg1, WFDictionaryKey="message",
                    WFInput=attachment(output(t_url, "Contents of URL"))))
    a.append(action("notification", WFNotificationActionTitle="FinPace",
                    WFNotificationActionBody=tokens(output(t_msg1, "Dictionary Value"))))
    a.append(action("conditional", GroupingIdentifier=g_main, WFControlFlowMode=2))

    wf = {
        "WFWorkflowName": name,
        "WFWorkflowClientVersion": "2302.0.4",
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowIcon": {"WFWorkflowIconStartColor": 463140863, "WFWorkflowIconGlyphNumber": 59511},
        "WFWorkflowTypes": [],
        "WFWorkflowHasShortcutInputVariables": True,
        "WFWorkflowInputContentItemClasses": [
            "WFDictionaryContentItem", "WFStringContentItem", "WFGenericFileContentItem", "WFNumberContentItem",
        ],
        "WFWorkflowActions": a,
        "WFWorkflowImportQuestions": [] if key else [{
            "ActionIndex": 0,
            "Category": "Parameter",
            "ParameterKey": "WFTextActionText",
            "DefaultValue": "",
            "Text": "Paste your household key from the FinPace app (Settings → Shortcut & Devices) · "
                    "הדביקו את מפתח הבית מאפליקציית FinPace (הגדרות ← שורטקאט ומכשירים)",
        }],
    }
    return wf


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--key", default="")
    ap.add_argument("--name", default="FinPace")
    ap.add_argument("--out", default="shortcuts/FinPace.shortcut")
    args = ap.parse_args()
    with tempfile.NamedTemporaryFile(suffix=".shortcut", delete=False) as f:
        plistlib.dump(build(args.key, args.name), f, fmt=plistlib.FMT_BINARY)
        unsigned = f.name
    subprocess.run(["shortcuts", "sign", "--mode", "anyone", "--input", unsigned, "--output", args.out], check=True)
    print(f"signed {args.out}")


if __name__ == "__main__":
    main()
