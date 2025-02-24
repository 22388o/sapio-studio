import { JSONSchema7 } from 'json-schema';
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    IconButton,
    TextField,
    Tooltip,
    Typography,
    useTheme,
} from '@mui/material';
import { green, purple } from '@mui/material/colors';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import DoubleArrowIcon from '@mui/icons-material/DoubleArrow';
import * as Bitcoin from 'bitcoinjs-lib';
import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Continuation, ContractModel } from '../../../Data/ContractManager';
import { PhantomTransactionModel } from '../../../Data/Transaction';
import { UTXOModel } from '../../../Data/UTXO';
import {
    get_wtxid_backwards,
    is_mock_outpoint,
    PrettyAmountField,
} from '../../../util';
import {
    create,
    fetch_utxo,
    selectUTXO,
    selectUTXOFlash,
    select_txn,
} from '../EntitySlice';
import Hex, { ASM } from './Hex';
import { OutpointDetail } from './OutpointDetail';
import './UTXODetail.css';
import { selectContinuation } from '../../ContractCreator/ContractCreatorSlice';
import Form from '@rjsf/core';
import { FormProps, FormValidation, ISubmitEvent } from '@rjsf/core';
import {
    add_effect_to_contract,
    recreate_contract,
    selectHasEffect,
} from '../../../AppSlice';

interface UTXODetailProps {
    entity: UTXOModel;
    contract: ContractModel;
}

export function UTXODetail(props: UTXODetailProps) {
    const theme = useTheme();
    const dispatch = useDispatch();
    const select_continuations = useSelector(selectContinuation);
    React.useEffect(() => {
        return () => {};
    });
    const txid = props.entity.txn.get_txid();
    const idx = props.entity.utxo.index;
    const outpoint = { hash: txid, nIn: idx };

    const external_utxo = useSelector(selectUTXO)(outpoint);
    const flash = useSelector(selectUTXOFlash);
    const this_is_mock = is_mock_outpoint(outpoint);
    const is_confirmed = external_utxo && external_utxo.confirmations > 0;
    const decomp =
        external_utxo?.scriptPubKey.address ??
        Bitcoin.script.toASM(
            Bitcoin.script.decompile(props.entity.utxo.script) ??
                Buffer.from('')
        );
    // first attempt to get the address from the extenral utxo if it's present,
    // otherwise attempt to read if from the utxo model
    let address = external_utxo?.scriptPubKey.address;
    let asm = external_utxo?.scriptPubKey.asm ?? null;
    if (!address) {
        address = 'UNKNOWN';
        try {
            asm = Bitcoin.script.toASM(props.entity.utxo.script);
            address = Bitcoin.address.fromOutputScript(
                props.entity.utxo.script,
                /// TODO: Read from preferences?
                Bitcoin.networks.regtest
            );
        } catch {}
    }
    const spends = props.entity.utxo.spends.map((elt, i) => (
        <div key={get_wtxid_backwards(elt.tx)} className="Spend">
            <Hex value={elt.get_txid()} label="TXID" />
            <Tooltip title="Go To The Spending Transaction">
                <IconButton
                    aria-label="goto-spending-txn"
                    onClick={() => dispatch(select_txn(elt.get_txid()))}
                >
                    <DoubleArrowIcon style={{ color: green[500] }} />
                </IconButton>
            </Tooltip>
        </div>
    ));
    const creator =
        !this_is_mock || is_confirmed ? null : (
            <Tooltip title="Create Contract">
                <IconButton
                    aria-label="create-contract"
                    onClick={() =>
                        dispatch(
                            create(
                                props.entity.txn.tx,
                                props.entity,
                                props.contract
                            )
                        )
                    }
                >
                    <AddCircleOutlineIcon style={{ color: green[500] }} />
                </IconButton>
            </Tooltip>
        );
    const check_exists =
        this_is_mock || is_confirmed ? null : (
            <Tooltip title="Check if Coin Exists">
                <IconButton
                    aria-label="check-coin-exists"
                    onClick={() => dispatch(fetch_utxo(outpoint))}
                >
                    <CloudDownloadIcon style={{ color: purple[500] }} />
                </IconButton>
            </Tooltip>
        );
    const title =
        props.entity.txn instanceof PhantomTransactionModel ? (
            <p>External UTXO</p>
        ) : (
            <PrettyAmountField amount={props.entity.utxo.amount} />
        );
    let obj = select_continuations(`${txid}:${idx}`);
    const continuations = obj
        ? Object.entries(obj).map(([k, v]) => {
              return <ContinuationOption k={k} v={v}></ContinuationOption>;
          })
        : null;
    const cont = continuations ? (
        <div>
            <Typography variant="h5" color={theme.palette.text.primary}>
                Continuations
            </Typography>
            {continuations}
        </div>
    ) : null;

    return (
        <div className="UTXODetail">
            <div>{flash}</div>
            <div>
                {creator}
                {check_exists}
            </div>
            {title}
            {cont}
            <OutpointDetail txid={txid} n={idx} />
            <ASM className="txhex" value={address} label="Address" />
            <ASM className="txhex" value={asm ?? 'UNKNOWN'} label="ASM" />
            {asm}
            <Typography variant="h5" color={theme.palette.text.primary}>
                Spent By
            </Typography>
            {spends}
        </div>
    );
}

function ContinuationOption(props: { k: string; v: Continuation }) {
    const [is_open, setOpen] = React.useState(false);
    const select_effect = useSelector(selectHasEffect);
    const name = props.k.substr(props.k.lastIndexOf('/') + 1);
    const dispatch = useDispatch();
    const form = React.useRef<any | null>(null);
    const name_form = React.useRef<any | null>(null);
    const name_schema: JSONSchema7 = {
        title: 'Name for this Update',
        type: 'string',
    };
    const this_effect_name = React.useRef('');
    const submit = (e: ISubmitEvent<any>) => {
        let name = this_effect_name.current;
        const data = e.formData;
        dispatch(add_effect_to_contract([props.k, name, data]));
    };

    const validate_name_unique = (
        data: string,
        errors: FormValidation
    ): FormValidation => {
        if (data === '') errors.addError('Name Required');
        if (select_effect(props.k, data)) errors.addError('Name Already Used');
        this_effect_name.current = data;
        return errors;
    };
    return (
        <div>
            <Button onClick={() => setOpen(true)} variant="contained">
                {name}
            </Button>
            <Dialog open={is_open} onClose={() => setOpen(false)}>
                <DialogTitle>
                    <Typography variant="h5">{name}</Typography>
                    <ASM className="txhex" value={props.k} label="Full Path" />
                </DialogTitle>
                <DialogContent>
                    <Form
                        schema={name_schema}
                        validate={validate_name_unique}
                        liveValidate
                        // NOTE: This is a bug documented here
                        // https://github.com/rjsf-team/react-jsonschema-form/issues/2135
                        // @ts-ignore
                        ref={name_form}
                    >
                        <div
                        // Cancels native submit button
                        ></div>
                    </Form>
                    <Form
                        schema={props.v.schema}
                        onSubmit={submit}
                        // NOTE: This is a bug documented here
                        // https://github.com/rjsf-team/react-jsonschema-form/issues/2135
                        // @ts-ignore
                        ref={form}
                    ></Form>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => dispatch(recreate_contract())}>
                        Recompile
                    </Button>
                    <Button onClick={() => setOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>
        </div>
    );
}
