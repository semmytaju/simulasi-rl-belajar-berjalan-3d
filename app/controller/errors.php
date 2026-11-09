<?php

class errors extends Controller {

    public function index($code = 404){
        $code = (int)$code;
        if (!in_array($code, [400, 401, 403, 404, 405, 500, 503])) {
            $code = 404;
        }
        $this->abort($code);
    }

    public function bad_request(){
        $this->abort(400);
    }

    public function unauthorized(){
        $this->abort(401);
    }

    public function forbidden(){
        $this->abort(403);
    }

    public function not_found(){
        $this->abort(404);
    }

    public function method_not_allowed(){
        $this->abort(405);
    }

    public function server_error(){
        $this->abort(500);
    }

    public function maintenance(){
        $this->abort(503);
    }
}
